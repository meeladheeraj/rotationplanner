/**
 * FEEDBACK #9 — intern leave & resume at the data layer (pglite, no live DB):
 * a leave applied to a saved schedule produces a NEW draft version with an
 * extended timeline, a leave_events row, and an audit entry; coverage gaps are
 * surfaced; and the operation is tenant-scoped.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { and, eq } from "drizzle-orm";
import { schedToBlocks } from "@rp/engine";

import type { DB } from "@/db";
import { auditLog, leaveEvents, schedules, tenants, users } from "@/db/schema";
import { createConfig, type DataCtx } from "@/lib/data/configs";
import {
  applyLeaveToSchedule,
  getScheduleDetail,
  listSchedules,
  saveSchedule,
  type SubmittedAssignment,
} from "@/lib/data/schedules";
import { HttpError } from "@/lib/tenant";

import { makeTestDb } from "./testdb";

// Three 2-week departments, staggered across 3 interns -> every (week,dept)=1.
const DEPTS = [
  { name: "A", weeks: 2, minCoverage: 1 },
  { name: "B", weeks: 2, minCoverage: 1 },
  { name: "C", weeks: 2, minCoverage: 1 },
];
const ROSTER = [
  [0, 0, 1, 1, 2, 2],
  [1, 1, 2, 2, 0, 0],
  [2, 2, 0, 0, 1, 1],
];

async function seedCtx(db: DB, slug: string): Promise<DataCtx> {
  const [t] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  assert.ok(t);
  const [u] = await db
    .insert(users)
    .values({ tenantId: t.id, email: `${slug}@example.com`, passwordHash: "x", role: "owner" })
    .returning({ id: users.id });
  assert.ok(u);
  return { db, tenantId: t.id, userId: u.id };
}

function submitted(): SubmittedAssignment[] {
  return ROSTER.map((schedule, i) => ({
    internIndex: i + 1,
    internLabel: `Intern ${i + 1}`,
    rotation: schedToBlocks(schedule).map((b) => ({
      dept: b.dept,
      deptName: DEPTS[b.dept]!.name,
      start: b.start,
      end: b.end,
    })),
  }));
}

async function seedSaved(ctx: DataCtx) {
  const configId = await createConfig(ctx, { name: "Test", nInterns: 3, departments: DEPTS });
  const saved = await saveSchedule(ctx, configId, { assignments: submitted() });
  assert.equal(saved.violations.length, 0, "base roster is fully covered");
  return { configId, scheduleId: saved.scheduleId };
}

test("applying a leave creates a new extended draft version + leave_events + audit", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db, "acme");
  const { configId, scheduleId } = await seedSaved(ctx);

  // Intern 1 takes 2 weeks off from week 0.
  const r = await applyLeaveToSchedule(ctx, scheduleId, 1, 0, 2);

  assert.equal(r.version, 2);
  assert.equal(r.status, "draft");
  assert.equal(r.totalWeeks, 8, "timeline extended by the 2 leave weeks");
  assert.equal(r.resumedDept, 0, "restarted department A");
  assert.ok(r.violations.length > 0, "the leave introduces coverage gaps");
  assert.ok(
    r.violations.some((v) => v.week === 0 && v.dept === 0 && v.count === 0),
    "department A is empty in week 0 during the leave",
  );

  // Two versions now exist for the config; source (v1) untouched.
  const versions = await listSchedules(ctx, configId);
  assert.equal(versions.length, 2);

  // leave_events row recorded.
  const events = await db.select().from(leaveEvents).where(eq(leaveEvents.tenantId, ctx.tenantId));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.internIndex, 1);
  assert.equal(events[0]?.startWeek, 0);
  assert.equal(events[0]?.leaveWeeks, 2);
  assert.equal(events[0]?.sourceScheduleId, scheduleId);
  assert.equal(events[0]?.resultScheduleId, r.scheduleId);

  // audit row recorded against the new version.
  const audits = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, ctx.tenantId), eq(auditLog.action, "leave_applied")));
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.entityId, r.scheduleId);

  // The new version persists the resumed roster: intern 1 still does A, B, C in
  // full (shifted after the 2 leave weeks).
  const detail = await getScheduleDetail(ctx, r.scheduleId);
  assert.ok(detail);
  assert.equal(detail!.stats.totalWeeks, 8);
  const i1 = detail!.assignments.find((a) => a.internIndex === 1)!;
  const depts = i1.rotation.map((b) => b.dept).sort((a, b) => a - b);
  assert.deepEqual(depts, [0, 1, 2], "intern 1 has a full block of every department");
  assert.ok(i1.rotation.every((b) => b.start >= 2), "all of intern 1's blocks are after the leave");
});

test("mid-department leave restarts that department in the persisted version", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db, "beta");
  const { scheduleId } = await seedSaved(ctx);

  // Intern 1 (A A B B C C) leaves at week 3 — mid-B — for 1 week.
  const r = await applyLeaveToSchedule(ctx, scheduleId, 1, 3, 1);
  const detail = await getScheduleDetail(ctx, r.scheduleId);
  const i1 = detail!.assignments.find((a) => a.internIndex === 1)!;
  // A completed (0-1); partial B at week 2 (history); then a FULL B block on resume.
  const bBlocks = i1.rotation.filter((b) => b.dept === 1);
  assert.ok(
    bBlocks.some((b) => b.end - b.start + 1 === 2),
    "B is restarted as a full 2-week block after the leave",
  );
  assert.equal(r.resumedDept, 1);
});

test("leave is tenant-scoped", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const a = await seedCtx(db, "alpha");
  const b = await seedCtx(db, "bravo");
  const { scheduleId } = await seedSaved(a);

  await assert.rejects(
    () => applyLeaveToSchedule(b, scheduleId, 1, 0, 2),
    (e) => e instanceof HttpError && e.status === 404,
    "tenant B cannot apply a leave to tenant A's schedule",
  );
});
