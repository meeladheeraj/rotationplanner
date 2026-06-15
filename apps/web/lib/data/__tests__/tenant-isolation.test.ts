/**
 * PHASE 2 GATE: two tenants cannot see or mutate each other's data.
 *
 * Runs against a real (in-memory) Postgres via pglite, exercising the exact
 * tenant-scoped data-access functions the route handlers use.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import { tenants, users } from "@/db/schema";
import {
  createConfig,
  deleteConfig,
  getConfig,
  listConfigs,
  updateConfig,
  type DataCtx,
} from "@/lib/data/configs";

import { makeTestDb } from "./testdb";

async function seedTenant(db: DB, name: string): Promise<{ tenantId: string; userId: string }> {
  const [t] = await db
    .insert(tenants)
    .values({ name, slug: name.toLowerCase() })
    .returning({ id: tenants.id });
  assert.ok(t);
  const [u] = await db
    .insert(users)
    .values({
      tenantId: t.id,
      email: `${name.toLowerCase()}@example.com`,
      passwordHash: "x",
      role: "owner",
    })
    .returning({ id: users.id });
  assert.ok(u);
  return { tenantId: t.id, userId: u.id };
}

test("tenant B cannot read, update, or delete tenant A's config", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;

  const a = await seedTenant(db, "Alpha");
  const b = await seedTenant(db, "Bravo");
  const ctxA: DataCtx = { db, tenantId: a.tenantId, userId: a.userId };
  const ctxB: DataCtx = { db, tenantId: b.tenantId, userId: b.userId };

  const configId = await createConfig(ctxA, {
    name: "A's roster",
    nInterns: 10,
    departments: [
      { name: "Surgery", weeks: 4 },
      { name: "Medicine", weeks: 4 },
    ],
  });

  // A can see its own config.
  const own = await getConfig(ctxA, configId);
  assert.ok(own, "tenant A should read its own config");
  assert.equal(own.name, "A's roster");

  // B cannot read A's config by id.
  const leaked = await getConfig(ctxB, configId);
  assert.equal(leaked, null, "tenant B must NOT read tenant A's config");

  // B's listing must not include A's config.
  const bList = await listConfigs(ctxB);
  assert.equal(bList.length, 0, "tenant B's list must be empty");

  // A's listing includes exactly its own.
  const aList = await listConfigs(ctxA);
  assert.equal(aList.length, 1);

  // B cannot update A's config.
  const updated = await updateConfig(ctxB, configId, { name: "hijacked" });
  assert.equal(updated, false, "tenant B must NOT update tenant A's config");
  const afterUpdate = await getConfig(ctxA, configId);
  assert.equal(afterUpdate?.name, "A's roster", "config name must be unchanged");

  // B cannot delete A's config.
  const deleted = await deleteConfig(ctxB, configId);
  assert.equal(deleted, false, "tenant B must NOT delete tenant A's config");
  const stillThere = await getConfig(ctxA, configId);
  assert.ok(stillThere, "A's config must still exist after B's delete attempt");
});

test("each tenant only sees its own configs in a shared table", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const a = await seedTenant(db, "Alpha");
  const b = await seedTenant(db, "Bravo");
  const ctxA: DataCtx = { db, tenantId: a.tenantId, userId: a.userId };
  const ctxB: DataCtx = { db, tenantId: b.tenantId, userId: b.userId };

  await createConfig(ctxA, { name: "A1", nInterns: 5, departments: [{ name: "X", weeks: 2 }] });
  await createConfig(ctxA, { name: "A2", nInterns: 5, departments: [{ name: "X", weeks: 2 }] });
  await createConfig(ctxB, { name: "B1", nInterns: 5, departments: [{ name: "X", weeks: 2 }] });

  const aList = await listConfigs(ctxA);
  const bList = await listConfigs(ctxB);
  assert.deepEqual(
    aList.map((c) => c.name).sort(),
    ["A1", "A2"],
  );
  assert.deepEqual(bList.map((c) => c.name).sort(), ["B1"]);
});
