/**
 * Server-authoritative schedule save: valid submissions persist & version up;
 * tampered submissions are rejected by engine re-validation (never persisted).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";
import { generate, getPreset, schedToBlocks } from "@rp/engine";

import type { DB } from "@/db";
import { schedules, tenants, users } from "@/db/schema";
import { createConfig, type DataCtx } from "@/lib/data/configs";
import { publishSchedule, saveSchedule, type SubmittedAssignment } from "@/lib/data/schedules";
import { HttpError } from "@/lib/tenant";

import { makeTestDb } from "./testdb";

async function seedCtx(db: DB): Promise<DataCtx> {
  const [t] = await db.insert(tenants).values({ name: "T", slug: "t" }).returning({ id: tenants.id });
  assert.ok(t);
  const [u] = await db
    .insert(users)
    .values({ tenantId: t.id, email: "t@example.com", passwordHash: "x", role: "owner" })
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

test("valid client schedule is re-validated and persisted as version 1, then 2", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db);

  const preset = getPreset("nmc-crmi-2021");
  assert.ok(preset);
  const deptNames = preset.departments.map((d) => d.name);

  const configId = await createConfig(ctx, {
    name: "NMC",
    nInterns: 135,
    departments: preset.departments.map((d) => ({ name: d.name, weeks: d.weeks, minCoverage: d.minCoverage })),
  });

  const gen = generate({ n: 135, departments: preset.departments, seed: 42 });
  const submitted = toSubmitted(gen.internSchedules, deptNames);

  const r1 = await saveSchedule(ctx, configId, { assignments: submitted });
  assert.equal(r1.version, 1);
  assert.equal(r1.status, "draft");
  assert.equal(r1.violations.length, 0);

  const r2 = await saveSchedule(ctx, configId, { assignments: submitted });
  assert.equal(r2.version, 2, "second save increments version");

  const rows = await db.select().from(schedules).where(eq(schedules.configId, configId));
  assert.equal(rows.length, 2);
});

test("tampered schedule (broken contiguity) is rejected and not persisted", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db);

  const preset = getPreset("nmc-crmi-2021");
  assert.ok(preset);
  const deptNames = preset.departments.map((d) => d.name);
  const configId = await createConfig(ctx, {
    name: "NMC",
    nInterns: 135,
    departments: preset.departments.map((d) => ({ name: d.name, weeks: d.weeks, minCoverage: d.minCoverage })),
  });

  const gen = generate({ n: 135, departments: preset.departments, seed: 7 });
  const submitted = toSubmitted(gen.internSchedules, deptNames);
  // Corrupt one intern: drop the last block so coverage/contiguity breaks.
  submitted[0]!.rotation = submitted[0]!.rotation.slice(0, -1);

  await assert.rejects(
    () => saveSchedule(ctx, configId, { assignments: submitted }),
    (err: unknown) => err instanceof HttpError && err.status === 422,
  );

  const rows = await db.select().from(schedules).where(eq(schedules.configId, configId));
  assert.equal(rows.length, 0, "invalid roster must NOT be persisted");
});

test("below-minimum schedule saves as a DRAFT (violations surfaced) but cannot be published", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const ctx = await seedCtx(db);

  // Small, fully-feasible config but far too few interns to staff ≥2 everywhere.
  const depts = [
    { name: "A", weeks: 2, minCoverage: 2 },
    { name: "B", weeks: 2, minCoverage: 2 },
    { name: "C", weeks: 1, minCoverage: 2 },
  ];
  const deptNames = depts.map((d) => d.name);
  const configId = await createConfig(ctx, { name: "Small", nInterns: 2, departments: depts });

  const gen = generate({ n: 2, departments: depts, seed: 3 });
  const submitted = toSubmitted(gen.internSchedules, deptNames);

  // Structurally sound but understaffed → saved as a draft with violations returned.
  const saved = await saveSchedule(ctx, configId, { assignments: submitted });
  assert.equal(saved.status, "draft");
  assert.ok(saved.violations.length > 0, "coverage shortfalls are surfaced on save");

  // Persisted, and stats record the shortfall count.
  const rows = await db.select().from(schedules).where(eq(schedules.id, saved.scheduleId));
  assert.equal(rows.length, 1, "below-minimum draft IS persisted");
  assert.equal(rows[0]!.stats.coverageViolations, saved.violations.length);

  // Publish is refused (strict coverage enforced only at publish time).
  await assert.rejects(
    () => publishSchedule(ctx, saved.scheduleId),
    (err: unknown) => err instanceof HttpError && err.status === 422,
  );

  // Still a draft after the refused publish.
  const after = await db.select().from(schedules).where(eq(schedules.id, saved.scheduleId));
  assert.equal(after[0]!.status, "draft", "refused publish must not change status");
});
