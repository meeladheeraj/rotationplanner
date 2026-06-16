/**
 * PHASE 3 GATE — end-to-end at the data layer (pglite, no live DB):
 *   generate → save draft → manual swap (engine re-validated, audited)
 *   → publish (immutable) → swap/publish refused → share (full + per-intern)
 *   → public read by token returns exactly what was shared, nothing more.
 * Plus tenant isolation on every Phase-3 write path.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { and, eq } from "drizzle-orm";
import { generate, getPreset, schedToBlocks } from "@rp/engine";

import type { DB } from "@/db";
import { auditLog, manualEdits, schedules, tenants, users } from "@/db/schema";
import { createConfig, type DataCtx } from "@/lib/data/configs";
import {
  applyManualSwap,
  getScheduleDetail,
  listSchedules,
  publishSchedule,
  saveSchedule,
  type SubmittedAssignment,
} from "@/lib/data/schedules";
import { createShareLink, getSharedSchedule } from "@/lib/data/share";
import { HttpError } from "@/lib/tenant";

import { makeTestDb } from "./testdb";

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

function toSubmitted(internSchedules: { id: number; schedule: number[] }[], deptNames: string[]): SubmittedAssignment[] {
  return internSchedules.map((is) => ({
    internIndex: is.id,
    internLabel: `Intern ${is.id}`,
    rotation: schedToBlocks(is.schedule).map((b) => ({
      dept: b.dept,
      deptName: deptNames[b.dept] ?? "",
      start: b.start,
      end: b.end,
    })),
  }));
}

async function seedDraft(ctx: DataCtx) {
  const preset = getPreset("nmc-crmi-2021")!;
  const deptNames = preset.departments.map((d) => d.name);
  const configId = await createConfig(ctx, {
    name: "NMC",
    nInterns: 135,
    departments: preset.departments.map((d) => ({ name: d.name, weeks: d.weeks, minCoverage: d.minCoverage })),
  });
  const gen = generate({ n: 135, departments: preset.departments, seed: 42 });
  const submitted = toSubmitted(gen.internSchedules, deptNames);
  const saved = await saveSchedule(ctx, configId, { assignments: submitted });
  return { configId, scheduleId: saved.scheduleId };
}

test("full flow: swap → publish → immutability → share (full + per-intern)", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db, "acme");
  const { scheduleId } = await seedDraft(ctx);

  // --- manual swap on the draft: engine re-validates, edit + audit recorded ---
  // Engine intern ids are 1-based, so valid internIndex values are 1..135.
  const before = await getScheduleDetail(ctx, scheduleId);
  assert.ok(before);
  const rotA0 = JSON.stringify(before.assignments.find((a) => a.internIndex === 1)!.rotation);
  const rotB0 = JSON.stringify(before.assignments.find((a) => a.internIndex === 2)!.rotation);

  const swap = await applyManualSwap(ctx, scheduleId, 1, 2);
  assert.equal(swap.violations.length, 0);

  const after = await getScheduleDetail(ctx, scheduleId);
  assert.ok(after);
  const rotA1 = JSON.stringify(after.assignments.find((a) => a.internIndex === 1)!.rotation);
  const rotB1 = JSON.stringify(after.assignments.find((a) => a.internIndex === 2)!.rotation);
  assert.equal(rotA1, rotB0, "intern 1 now holds intern 2's old rotation");
  assert.equal(rotB1, rotA0, "intern 2 now holds intern 1's old rotation");

  const edits = await db.select().from(manualEdits).where(eq(manualEdits.scheduleId, scheduleId));
  assert.equal(edits.length, 1, "manual_edits row written");
  const swapAudits = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, ctx.tenantId), eq(auditLog.action, "manual_swap")));
  assert.equal(swapAudits.length, 1, "manual_swap audit written in same tx");

  // --- publish → immutable ---
  const pub = await publishSchedule(ctx, scheduleId);
  assert.equal(pub.status, "published");

  await assert.rejects(
    () => applyManualSwap(ctx, scheduleId, 1, 3),
    (e: unknown) => e instanceof HttpError && e.status === 409,
    "published schedule must refuse manual edits",
  );
  await assert.rejects(
    () => publishSchedule(ctx, scheduleId),
    (e: unknown) => e instanceof HttpError && e.status === 409,
    "re-publishing a published schedule is rejected",
  );

  // --- share: full link exposes whole roster ---
  const full = await createShareLink(ctx, scheduleId, { scope: "full" });
  const fullView = await getSharedSchedule(db, full.token);
  assert.ok(fullView);
  assert.equal(fullView.assignments.length, 135);
  assert.equal(fullView.scope, "full");
  assert.equal(fullView.status, "published");
  // FEEDBACK #6: stats + per-dept minCoverage are carried on the shared view so the
  // public page can render the full ScheduleViews (heatmap intensity + below-min flags).
  assert.ok(fullView.stats.totalWeeks > 0);
  assert.ok(fullView.departments.every((d) => typeof d.minCoverage === "number"));

  // --- share: per-intern link exposes exactly one intern ---
  const per = await createShareLink(ctx, scheduleId, { scope: "per_intern", internLabel: "Intern 5" });
  const perView = await getSharedSchedule(db, per.token);
  assert.ok(perView);
  assert.equal(perView.assignments.length, 1);
  assert.equal(perView.assignments[0]!.internLabel, "Intern 5");

  // --- unknown / tampered token returns null (no leakage) ---
  assert.equal(await getSharedSchedule(db, "not-a-real-token"), null);
});

test("tenant isolation: tenant B cannot publish, swap, or share tenant A's schedule", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctxA = await seedCtx(db, "tenant-a");
  const ctxB = await seedCtx(db, "tenant-b");
  const { scheduleId } = await seedDraft(ctxA);

  await assert.rejects(
    () => publishSchedule(ctxB, scheduleId),
    (e: unknown) => e instanceof HttpError && e.status === 404,
  );
  await assert.rejects(
    () => applyManualSwap(ctxB, scheduleId, 0, 1),
    (e: unknown) => e instanceof HttpError && e.status === 404,
  );
  await assert.rejects(
    () => createShareLink(ctxB, scheduleId, { scope: "full" }),
    (e: unknown) => e instanceof HttpError && e.status === 404,
  );

  // B sees none of A's schedule versions.
  const bList = await listSchedules(ctxB, (await getScheduleDetail(ctxA, scheduleId))!.configId);
  assert.equal(bList.length, 0);
  // A still owns exactly one schedule.
  const aRows = await db.select().from(schedules).where(eq(schedules.tenantId, ctxA.tenantId));
  assert.equal(aRows.length, 1);
});
