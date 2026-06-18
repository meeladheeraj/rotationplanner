/**
 * FEEDBACK #9 — intern leave & resume at the data layer (pglite, no live DB).
 * The year is hard-capped: a leave produces a NEW draft version of the SAME
 * length, records which departments carry over to the next batch, surfaces
 * coverage gaps, and is tenant-scoped.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { and, eq } from "drizzle-orm";
import { schedToBlocks } from "@rp/engine";

import type { DB } from "@/db";
import { auditLog, leaveEvents, schedules, tenants, users } from "@/db/schema";
import { createConfig, type DataCtx } from "@/lib/data/configs";
import {
  addCarryOverInterns,
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

test("leave creates a same-length draft version + records carry-over + audit", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db, "acme");
  const { configId, scheduleId } = await seedSaved(ctx);

  // Intern 1 (A A B B C C) takes 2 weeks off from week 0. A and B fit after the
  // leave (weeks 2-5); C does not -> carries over.
  const r = await applyLeaveToSchedule(ctx, scheduleId, 1, 0, 2);

  assert.equal(r.version, 2);
  assert.equal(r.status, "draft");
  assert.equal(r.totalWeeks, 6, "year length is unchanged (capped)");
  assert.deepEqual(r.carryOver, [2], "department C carries to the next batch");
  assert.ok(r.violations.some((v) => v.week === 0 && v.dept === 0 && v.count === 0));

  const versions = await listSchedules(ctx, configId);
  assert.equal(versions.length, 2);

  const events = await db.select().from(leaveEvents).where(eq(leaveEvents.tenantId, ctx.tenantId));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.internIndex, 1);
  assert.deepEqual(events[0]?.carryOver, [2]);
  assert.equal(events[0]?.resultScheduleId, r.scheduleId);

  const audits = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, ctx.tenantId), eq(auditLog.action, "leave_applied")));
  assert.equal(audits.length, 1);

  // New version: intern 1 did A and B in-year (not C); length stays 6.
  const detail = await getScheduleDetail(ctx, r.scheduleId);
  assert.equal(detail!.stats.totalWeeks, 6);
  const i1 = detail!.assignments.find((a) => a.internIndex === 1)!;
  const depts = [...new Set(i1.rotation.map((b) => b.dept))].sort((x, y) => x - y);
  assert.deepEqual(depts, [0, 1], "intern 1 completed A and B in-year; C carried over");
});

test("mid-department leave restarts that department within the capped year", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db, "beta");
  const { scheduleId } = await seedSaved(ctx);

  // Intern 1 leaves at week 3 (mid-B) for 1 week. B restarts full at weeks 4-5; C carries over.
  const r = await applyLeaveToSchedule(ctx, scheduleId, 1, 3, 1);
  assert.equal(r.resumedDept, 1);
  assert.deepEqual(r.carryOver, [2]);

  const detail = await getScheduleDetail(ctx, r.scheduleId);
  const i1 = detail!.assignments.find((a) => a.internIndex === 1)!;
  const fullB = i1.rotation.filter((b) => b.dept === 1).some((b) => b.end - b.start + 1 === 2);
  assert.ok(fullB, "B is restarted as a full 2-week block");
});

test("adding carry-over students appends partial-schedule interns as a new version", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db, "gamma");
  const { configId, scheduleId } = await seedSaved(ctx);

  // A returning student who only needs department C (index 2).
  const r = await addCarryOverInterns(ctx, scheduleId, [
    { internLabel: "Returning — Asha", departments: [2] },
  ]);

  assert.equal(r.added, 1);
  assert.equal(r.version, 2);

  const versions = await listSchedules(ctx, configId);
  assert.equal(versions.length, 2);

  const detail = await getScheduleDetail(ctx, r.scheduleId);
  assert.equal(detail!.assignments.length, 4, "3 original + 1 carry-over");
  const added = detail!.assignments.find((a) => a.internLabel === "Returning — Asha")!;
  assert.ok(added);
  // Only department C, laid out from week 0.
  const depts = [...new Set(added.rotation.map((b) => b.dept))];
  assert.deepEqual(depts, [2]);
  assert.equal(added.rotation[0]?.start, 0, "carry-over schedule starts at week 0");

  // rejects an out-of-range department
  await assert.rejects(
    () => addCarryOverInterns(ctx, scheduleId, [{ internLabel: "X", departments: [99] }]),
    (e) => e instanceof HttpError && e.status === 400,
  );
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
  );
});
