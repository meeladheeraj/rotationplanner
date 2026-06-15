/**
 * Share links + public (unauthenticated) read access.
 *
 * Creating a link is tenant-scoped (only the owning tenant may share a schedule).
 * READING a shared schedule is intentionally NOT tenant-scoped — a public visitor
 * has no session — but it is gated entirely by possession of an unguessable token,
 * and only ever exposes the single schedule that token points at (optionally a
 * single intern, for per_intern scope). No other tenant data is reachable.
 */
import { randomBytes } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import type { DB } from "@/db";
import {
  assignments,
  configs,
  departments,
  schedules,
  shareLinks,
  type AssignmentBlock,
  type ScheduleStatus,
  type ShareScope,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { HttpError } from "@/lib/tenant";
import type { DataCtx } from "@/lib/data/configs";

export interface CreateShareLinkInput {
  scope: ShareScope;
  internLabel?: string | null;
  expiresAt?: Date | null;
}

export interface ShareLinkRecord {
  token: string;
  scope: ShareScope;
  internLabel: string | null;
  expiresAt: Date | null;
}

function newToken(): string {
  // 256 bits of entropy, URL-safe.
  return randomBytes(32).toString("base64url");
}

/** Create a share link for a tenant-owned schedule. Audit in same tx. */
export async function createShareLink(
  ctx: DataCtx,
  scheduleId: string,
  input: CreateShareLinkInput,
): Promise<ShareLinkRecord> {
  if (input.scope === "per_intern" && !input.internLabel) {
    throw new HttpError(400, "per_intern share links require an internLabel");
  }
  return ctx.db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: schedules.id })
      .from(schedules)
      .where(and(eq(schedules.id, scheduleId), eq(schedules.tenantId, ctx.tenantId)))
      .limit(1);
    if (!owned[0]) throw new HttpError(404, "Schedule not found");

    const token = newToken();
    await tx.insert(shareLinks).values({
      scheduleId,
      token,
      scope: input.scope,
      internLabel: input.scope === "per_intern" ? input.internLabel ?? null : null,
      expiresAt: input.expiresAt ?? null,
    });
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "share",
      entityType: "schedule",
      entityId: scheduleId,
      metadata: { scope: input.scope, internLabel: input.internLabel ?? null },
    });
    return {
      token,
      scope: input.scope,
      internLabel: input.scope === "per_intern" ? input.internLabel ?? null : null,
      expiresAt: input.expiresAt ?? null,
    };
  });
}

export interface PublicScheduleView {
  scope: ShareScope;
  configName: string;
  totalWeeks: number;
  version: number;
  status: ScheduleStatus;
  generatedAt: Date;
  departments: { name: string; weeks: number }[];
  assignments: {
    internIndex: number;
    internLabel: string;
    rotation: AssignmentBlock[];
  }[];
}

/**
 * Resolve a share token to a read-only schedule view. NOT tenant-scoped by
 * design (public visitor); access is gated solely by the unguessable token, and
 * only the pointed-at schedule is returned. Returns null for unknown/expired
 * tokens, or when a per_intern link's intern is absent. `db` must be a raw
 * (non-request) DB handle.
 */
export async function getSharedSchedule(
  db: DB,
  token: string,
): Promise<PublicScheduleView | null> {
  const linkRows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  const link = linkRows[0];
  if (!link) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;

  const schedRows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, link.scheduleId))
    .limit(1);
  const sched = schedRows[0];
  if (!sched) return null;

  const cfgRows = await db
    .select()
    .from(configs)
    .where(eq(configs.id, sched.configId))
    .limit(1);
  const cfg = cfgRows[0];
  if (!cfg) return null;

  const deptRows = await db
    .select()
    .from(departments)
    .where(eq(departments.configId, cfg.id))
    .orderBy(asc(departments.sortOrder));

  let aRows = await db
    .select()
    .from(assignments)
    .where(eq(assignments.scheduleId, sched.id))
    .orderBy(asc(assignments.internIndex));

  if (link.scope === "per_intern") {
    aRows = aRows.filter((a) => a.internLabel === link.internLabel);
    if (aRows.length === 0) return null;
  }

  return {
    scope: link.scope,
    configName: cfg.name,
    totalWeeks: cfg.totalWeeks,
    version: sched.version,
    status: sched.status,
    generatedAt: sched.generatedAt,
    departments: deptRows.map((d) => ({ name: d.name, weeks: d.weeks })),
    assignments: aRows.map((a) => ({
      internIndex: a.internIndex,
      internLabel: a.internLabel,
      rotation: a.rotation,
    })),
  };
}
