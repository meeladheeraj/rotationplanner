/**
 * Tenant-scoped schedule persistence with SERVER-AUTHORITATIVE re-validation.
 *
 * The browser generates the schedule (free compute); the server independently
 * re-runs @rp/engine validate() before persisting. The DB never stores an
 * invalid roster. (plan §4 "trust nothing from the client".)
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";

import {
  proposeSwap,
  repairEdit,
  schedToBlocks,
  validate,
  validateStructure,
  type Config as EngineConfig,
  type InternSchedule,
  type Violation,
} from "@rp/engine";

import type { DB } from "@/db";
import {
  assignments,
  configs,
  departments,
  manualEdits,
  schedules,
  type AssignmentBlock,
  type ScheduleStatus,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { HttpError } from "@/lib/tenant";
import type { DataCtx } from "@/lib/data/configs";

export const ENGINE_VERSION = "0.0.1";

export interface SubmittedAssignment {
  internIndex: number;
  internLabel: string;
  rotation: AssignmentBlock[];
}

export interface SaveScheduleInput {
  assignments: SubmittedAssignment[];
  engineVersion?: string;
}

export interface SaveScheduleResult {
  scheduleId: string;
  version: number;
  status: ScheduleStatus;
  violations: Violation[];
}

interface LoadedConfig {
  id: string;
  nInterns: number;
  totalWeeks: number;
  engineConfig: EngineConfig;
}

/** Loads a tenant's config + departments and builds the engine Config. */
async function loadEngineConfig(ctx: DataCtx, configId: string): Promise<LoadedConfig | null> {
  const rows = await ctx.db
    .select()
    .from(configs)
    .where(and(eq(configs.id, configId), eq(configs.tenantId, ctx.tenantId)))
    .limit(1);
  const cfg = rows[0];
  if (!cfg) return null;
  const depts = await ctx.db
    .select()
    .from(departments)
    .where(eq(departments.configId, configId))
    .orderBy(departments.sortOrder);
  return {
    id: cfg.id,
    nInterns: cfg.nInterns,
    totalWeeks: cfg.totalWeeks,
    engineConfig: {
      n: cfg.nInterns,
      seed: cfg.seed ?? undefined,
      departments: depts.map((d) => ({
        name: d.name,
        weeks: d.weeks,
        minCoverage: d.minCoverage,
      })),
    },
  };
}

/** Reconstructs per-week dept-index arrays from submitted rotation blocks. */
export function assignmentsToInternSchedules(
  submitted: SubmittedAssignment[],
  totalWeeks: number,
  deptCount: number,
): InternSchedule[] {
  return submitted.map((a) => {
    const schedule = new Array<number>(totalWeeks).fill(-1);
    for (const blk of a.rotation) {
      if (blk.dept < 0 || blk.dept >= deptCount) {
        throw new HttpError(422, `Assignment references invalid department index ${blk.dept}`);
      }
      for (let w = blk.start; w <= blk.end; w++) {
        if (w < 0 || w >= totalWeeks) {
          throw new HttpError(422, `Assignment references week ${w} outside 0..${totalWeeks - 1}`);
        }
        schedule[w] = blk.dept;
      }
    }
    return { id: a.internIndex, schedule };
  });
}

/**
 * Re-validates a client-submitted schedule and persists it as the next version
 * (status 'draft'). The server is authoritative on STRUCTURE — a roster that is
 * structurally broken (bad contiguity / durations / week count) is corrupt data
 * and is rejected (422), never persisted. A structurally-sound roster that merely
 * falls below a department's minCoverage IS allowed to be saved as a draft: its
 * coverage violations are surfaced (returned + recorded in stats) and the strict
 * coverage rule is enforced only at PUBLISH time (see publishSchedule).
 */
export async function saveSchedule(
  ctx: DataCtx,
  configId: string,
  input: SaveScheduleInput,
): Promise<SaveScheduleResult> {
  const loaded = await loadEngineConfig(ctx, configId);
  if (!loaded) throw new HttpError(404, "Config not found");

  const deptCount = loaded.engineConfig.departments.length;
  const internSchedules = assignmentsToInternSchedules(
    input.assignments,
    loaded.totalWeeks,
    deptCount,
  );

  // Hard gate: structure must be sound. Coverage shortfalls are allowed as drafts.
  const structure = validateStructure(loaded.engineConfig, internSchedules);
  if (!structure.ok) {
    throw new HttpError(
      422,
      JSON.stringify({ message: "Schedule is structurally invalid", violations: structure.violations }),
    );
  }

  // Coverage violations (week/dept below minCoverage) are surfaced, not blocking.
  const coverage = validate(loaded.engineConfig, internSchedules);
  const coverageViolations = coverage.violations;

  // Derive trustworthy stats from the (structurally-validated) submission.
  const stats = computeStats(loaded.engineConfig, internSchedules, coverageViolations.length);

  return ctx.db.transaction(async (tx) => {
    const versionRows = await tx
      .select({ next: sql<number>`coalesce(max(${schedules.version}), 0) + 1` })
      .from(schedules)
      .where(eq(schedules.configId, configId));
    const version = Number(versionRows[0]?.next ?? 1);

    const [sched] = await tx
      .insert(schedules)
      .values({
        tenantId: ctx.tenantId,
        configId,
        version,
        status: "draft",
        generatedBy: ctx.userId ?? null,
        engineVersion: input.engineVersion ?? ENGINE_VERSION,
        stats,
      })
      .returning({ id: schedules.id });
    if (!sched) throw new Error("Failed to create schedule");

    if (input.assignments.length > 0) {
      await tx.insert(assignments).values(
        input.assignments.map((a) => ({
          scheduleId: sched.id,
          internIndex: a.internIndex,
          internLabel: a.internLabel,
          rotation: a.rotation,
        })),
      );
    }
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "create",
      entityType: "schedule",
      entityId: sched.id,
      metadata: { configId, version },
    });

    return { scheduleId: sched.id, version, status: "draft" as const, violations: coverageViolations };
  });
}

function computeStats(config: EngineConfig, internSchedules: InternSchedule[], coverageViolations = 0) {
  const M = config.departments.length;
  const TW = config.departments.reduce((a, d) => a + d.weeks, 0);
  const count: number[][] = Array.from({ length: TW }, () => new Array<number>(M).fill(0));
  for (const { schedule } of internSchedules) {
    for (let w = 0; w < TW; w++) {
      const d = schedule[w];
      if (d !== undefined && d >= 0 && d < M) count[w]![d]! += 1;
    }
  }
  let minCount = Infinity;
  let maxCount = 0;
  for (let w = 0; w < TW; w++) {
    for (let d = 0; d < M; d++) {
      const c = count[w]![d]!;
      if (c < minCount) minCount = c;
      if (c > maxCount) maxCount = c;
    }
  }
  let theoreticalMinN = 0;
  for (const d of config.departments) {
    theoreticalMinN = Math.max(
      theoreticalMinN,
      Math.ceil(((d.minCoverage ?? 2) * TW) / d.weeks),
    );
  }
  return {
    totalWeeks: TW,
    minCount: minCount === Infinity ? 0 : minCount,
    maxCount,
    theoreticalMinN,
    candidateCount: internSchedules.length,
    uncoverableCells: 0,
    coverageViolations,
  };
}

// ---------------------------------------------------------------------------
// Listing & detail (tenant-scoped)
// ---------------------------------------------------------------------------

export interface ScheduleSummary {
  id: string;
  configId: string;
  version: number;
  status: ScheduleStatus;
  generatedAt: Date;
  engineVersion: string;
  stats: import("@rp/engine").ScheduleStats;
}

export interface ScheduleDetail extends ScheduleSummary {
  assignments: {
    internIndex: number;
    internLabel: string;
    rotation: AssignmentBlock[];
  }[];
}

/** All schedule versions for a config, newest first. Tenant-scoped. */
export async function listSchedules(
  ctx: DataCtx,
  configId: string,
): Promise<ScheduleSummary[]> {
  const rows = await ctx.db
    .select()
    .from(schedules)
    .where(and(eq(schedules.configId, configId), eq(schedules.tenantId, ctx.tenantId)))
    .orderBy(desc(schedules.version));
  return rows.map(toSummary);
}

/** A single schedule + its assignments. Tenant-scoped; null if not owned. */
export async function getScheduleDetail(
  ctx: DataCtx,
  scheduleId: string,
): Promise<ScheduleDetail | null> {
  const rows = await ctx.db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, scheduleId), eq(schedules.tenantId, ctx.tenantId)))
    .limit(1);
  const s = rows[0];
  if (!s) return null;
  const aRows = await ctx.db
    .select()
    .from(assignments)
    .where(eq(assignments.scheduleId, scheduleId))
    .orderBy(asc(assignments.internIndex));
  return {
    ...toSummary(s),
    assignments: aRows.map((a) => ({
      internIndex: a.internIndex,
      internLabel: a.internLabel,
      rotation: a.rotation,
    })),
  };
}

type ScheduleRow = typeof schedules.$inferSelect;
function toSummary(s: ScheduleRow): ScheduleSummary {
  return {
    id: s.id,
    configId: s.configId,
    version: s.version,
    status: s.status,
    generatedAt: s.generatedAt,
    engineVersion: s.engineVersion,
    stats: s.stats,
  };
}

// ---------------------------------------------------------------------------
// Publish flow — published rosters are IMMUTABLE
// ---------------------------------------------------------------------------

/**
 * Transition a draft schedule to 'published'. Published rosters are immutable:
 * any subsequent write path (manual swap, re-publish) must refuse them. Audit is
 * written in the same transaction. Tenant-scoped; throws 404 if not owned, 409 if
 * not currently a draft.
 */
export async function publishSchedule(
  ctx: DataCtx,
  scheduleId: string,
): Promise<{ id: string; version: number; status: ScheduleStatus }> {
  // STRICT coverage is enforced at publish time: a published roster is immutable
  // and distributed, so it must be fully staffed. Re-validate server-side from the
  // persisted assignments (trust nothing that was stored before). This read +
  // validation happens BEFORE the transaction so it doesn't query the same
  // connection that has an open transaction.
  const detail = await getScheduleDetail(ctx, scheduleId);
  if (!detail) throw new HttpError(404, "Schedule not found");
  if (detail.status === "published") {
    throw new HttpError(409, "Schedule is already published and is immutable");
  }
  if (detail.status !== "draft") {
    throw new HttpError(409, `Cannot publish a schedule with status '${detail.status}'`);
  }
  const loaded = await loadEngineConfig(ctx, detail.configId);
  if (!loaded) throw new HttpError(404, "Config not found");
  const internSchedules = detailToInternSchedules(detail.assignments, loaded.totalWeeks);
  const result = validate(loaded.engineConfig, internSchedules);
  if (!result.ok) {
    throw new HttpError(
      422,
      JSON.stringify({
        message:
          "Cannot publish: schedule is below the required minimum coverage. Keep it as a draft, or regenerate with more interns.",
        violations: result.violations,
      }),
    );
  }

  return ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schedules)
      .where(and(eq(schedules.id, scheduleId), eq(schedules.tenantId, ctx.tenantId)))
      .limit(1);
    const s = rows[0];
    if (!s) throw new HttpError(404, "Schedule not found");
    if (s.status === "published") {
      throw new HttpError(409, "Schedule is already published and is immutable");
    }
    if (s.status !== "draft") {
      throw new HttpError(409, `Cannot publish a schedule with status '${s.status}'`);
    }
    await tx
      .update(schedules)
      .set({ status: "published" })
      .where(and(eq(schedules.id, scheduleId), eq(schedules.tenantId, ctx.tenantId)));
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "publish",
      entityType: "schedule",
      entityId: scheduleId,
      metadata: { configId: s.configId, version: s.version },
    });
    return { id: scheduleId, version: s.version, status: "published" as const };
  });
}

// ---------------------------------------------------------------------------
// Manual swap — exchange two interns' rotations via engine repairEdit
// ---------------------------------------------------------------------------

export interface SwapResult {
  scheduleId: string;
  violations: Violation[];
}

/** Reconstruct engine InternSchedule[] from persisted assignment blocks. */
function detailToInternSchedules(
  assignmentRows: ScheduleDetail["assignments"],
  totalWeeks: number,
): InternSchedule[] {
  return assignmentRows.map((a) => {
    const schedule = new Array<number>(totalWeeks).fill(-1);
    for (const blk of a.rotation) {
      for (let w = blk.start; w <= blk.end; w++) schedule[w] = blk.dept;
    }
    return { id: a.internIndex, schedule };
  });
}

/**
 * Swap the full-year rotations of two interns on a DRAFT schedule. The engine
 * re-validates the whole roster (repairEdit) before anything is persisted;
 * published schedules are refused (immutable). The assignment rows, a
 * manual_edits record, and the audit_log row are all written in one transaction.
 */
export async function applyManualSwap(
  ctx: DataCtx,
  scheduleId: string,
  internIndexA: number,
  internIndexB: number,
): Promise<SwapResult> {
  if (internIndexA === internIndexB) {
    throw new HttpError(400, "Cannot swap an intern with itself");
  }
  const detail = await getScheduleDetail(ctx, scheduleId);
  if (!detail) throw new HttpError(404, "Schedule not found");
  if (detail.status === "published") {
    throw new HttpError(409, "Published schedules are immutable and cannot be edited");
  }

  const loaded = await loadEngineConfig(ctx, detail.configId);
  if (!loaded) throw new HttpError(404, "Config not found");

  const internSchedules = detailToInternSchedules(detail.assignments, loaded.totalWeeks);
  const edits = proposeSwap(internSchedules, internIndexA, internIndexB);
  if (edits.length === 0) {
    throw new HttpError(400, "One or both intern indices are not present in this schedule");
  }
  const result = repairEdit(loaded.engineConfig, internSchedules, edits);
  if (!result.ok) {
    throw new HttpError(
      422,
      JSON.stringify({ message: "Swap would make the roster invalid", violations: result.violations }),
    );
  }

  const deptNames = loaded.engineConfig.departments.map((d) => d.name);
  const byIndex = new Map(detail.assignments.map((a) => [a.internIndex, a]));
  const a = byIndex.get(internIndexA)!;
  const b = byIndex.get(internIndexB)!;
  const rotA = blocksFor(result.applied, internIndexA, deptNames);
  const rotB = blocksFor(result.applied, internIndexB, deptNames);

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(assignments)
      .set({ rotation: rotA })
      .where(and(eq(assignments.scheduleId, scheduleId), eq(assignments.internIndex, internIndexA)));
    await tx
      .update(assignments)
      .set({ rotation: rotB })
      .where(and(eq(assignments.scheduleId, scheduleId), eq(assignments.internIndex, internIndexB)));
    await tx.insert(manualEdits).values({
      scheduleId,
      editedBy: ctx.userId ?? null,
      action: "swap",
      payload: { internIndexA, internIndexB, labelA: a.internLabel, labelB: b.internLabel },
      validationResult: { ok: true, violations: [] },
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "manual_swap",
      entityType: "schedule",
      entityId: scheduleId,
      metadata: { internIndexA, internIndexB },
    });
  });

  return { scheduleId, violations: [] };
}

/** Extract one intern's rotation as persisted AssignmentBlock[] from a roster. */
function blocksFor(
  roster: InternSchedule[],
  internId: number,
  deptNames: string[],
): AssignmentBlock[] {
  const found = roster.find((s) => s.id === internId);
  if (!found) return [];
  return schedToBlocks(found.schedule).map((b) => ({
    dept: b.dept,
    deptName: deptNames[b.dept] ?? "",
    start: b.start,
    end: b.end,
  }));
}
