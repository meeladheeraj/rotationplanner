/**
 * Tenant-scoped schedule persistence with SERVER-AUTHORITATIVE re-validation.
 *
 * The browser generates the schedule (free compute); the server independently
 * re-runs @rp/engine validate() before persisting. The DB never stores an
 * invalid roster. (plan §4 "trust nothing from the client".)
 */
import { and, eq, sql } from "drizzle-orm";

import {
  validate,
  type Config as EngineConfig,
  type InternSchedule,
  type Violation,
} from "@rp/engine";

import type { DB } from "@/db";
import {
  assignments,
  configs,
  departments,
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
 * Re-validates a client-submitted schedule and, if valid, persists it as the
 * next version (status 'draft'). Throws 422 with violations if invalid.
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

  const result = validate(loaded.engineConfig, internSchedules);
  if (!result.ok) {
    throw new HttpError(422, JSON.stringify({ message: "Schedule failed validation", violations: result.violations }));
  }

  // Derive trustworthy stats from the (validated) submission.
  const stats = computeStats(loaded.engineConfig, internSchedules);

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

    return { scheduleId: sched.id, version, status: "draft" as const, violations: [] };
  });
}

function computeStats(config: EngineConfig, internSchedules: InternSchedule[]) {
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
  };
}
