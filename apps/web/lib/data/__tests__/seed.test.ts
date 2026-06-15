/**
 * Demo seed script test (pglite, no live DB). Verifies that seedDemo():
 *  - creates the demo tenant + owner user
 *  - persists a PUBLISHED schedule whose roster validates (135 interns)
 *  - mints a working full-scope share link resolvable by token
 *  - is IDEMPOTENT: a second run replaces (not duplicates) the demo tenant,
 *    leaving exactly one demo user and a fresh published roster.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import { schedules, users } from "@/db/schema";
import { getSharedSchedule } from "@/lib/data/share";
import { seedDemo } from "@/scripts/seed";

import { makeTestDb } from "./testdb";

// N=135 is the proven fully-coverable size for the NMC preset (1-week
// departments at minCoverage 2 require ~104 interns minimum); a smaller N would
// fail server re-validation. seed fixed so the roster is deterministic.
const OPTS = { nInterns: 135, seed: 42, email: "demo@example.test" };

test("seedDemo creates a published, shareable demo roster", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const r = await seedDemo(db, OPTS);

  // user + tenant exist
  const u = await db.select().from(users).where(eq(users.email, OPTS.email)).limit(1);
  assert.equal(u.length, 1);
  assert.equal(u[0]!.role, "owner");

  // schedule persisted & published (server re-validation passed, else save throws)
  const s = await db.select().from(schedules).where(eq(schedules.id, r.scheduleId)).limit(1);
  assert.equal(s.length, 1);
  assert.equal(s[0]!.status, "published");
  assert.equal(r.version, 1);

  // share link resolves to a full roster with every intern
  const view = await getSharedSchedule(db, r.shareToken);
  assert.ok(view, "share token should resolve");
  assert.equal(view!.scope, "full");
  assert.equal(view!.assignments.length, OPTS.nInterns);
});

test("seedDemo is idempotent — re-running replaces the demo tenant", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const first = await seedDemo(db, OPTS);
  const second = await seedDemo(db, OPTS);

  // exactly one demo user remains
  const u = await db.select().from(users).where(eq(users.email, OPTS.email));
  assert.equal(u.length, 1);

  // it's a brand-new tenant/schedule, and the old share token no longer resolves
  assert.notEqual(first.tenantId, second.tenantId);
  const stale = await getSharedSchedule(db, first.shareToken);
  assert.equal(stale, null);
  const fresh = await getSharedSchedule(db, second.shareToken);
  assert.ok(fresh);
});
