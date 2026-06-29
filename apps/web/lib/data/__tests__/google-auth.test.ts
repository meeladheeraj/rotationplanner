import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import { tenants, users } from "@/db/schema";
import { resolveOrCreateGoogleUser } from "@/lib/data/google-auth";
import { makeTestDb } from "./testdb";

test("first Google sign-in provisions a tenant + passwordless owner", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const { userId, created } = await resolveOrCreateGoogleUser(db, {
    sub: "google-123",
    email: "Asha@Hospital.org",
    name: "Asha Rao",
  });
  assert.equal(created, true);

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  assert.ok(u);
  assert.equal(u!.email, "asha@hospital.org"); // normalized lower-case
  assert.equal(u!.googleSub, "google-123");
  assert.equal(u!.passwordHash, null); // no password for Google-only account
  assert.equal(u!.role, "owner");

  const [t] = await db.select().from(tenants).where(eq(tenants.id, u!.tenantId)).limit(1);
  assert.ok(t, "a tenant was created");
});

test("returning Google user (same sub) resolves to the same account, no duplicate", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const first = await resolveOrCreateGoogleUser(db, { sub: "sub-x", email: "x@y.org" });
  const second = await resolveOrCreateGoogleUser(db, { sub: "sub-x", email: "x@y.org" });
  assert.equal(second.created, false);
  assert.equal(second.userId, first.userId);
  const all = await db.select({ id: users.id }).from(users);
  assert.equal(all.length, 1);
});

test("existing password account is linked by email (no new tenant)", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const [t] = await db
    .insert(tenants)
    .values({ name: "Existing Org", slug: "existing-org-abc" })
    .returning({ id: tenants.id });
  const [u] = await db
    .insert(users)
    .values({ tenantId: t!.id, email: "doc@hospital.org", passwordHash: "scrypt$x", role: "owner" })
    .returning({ id: users.id });

  const res = await resolveOrCreateGoogleUser(db, {
    sub: "g-link",
    email: "doc@hospital.org",
    name: "Dr Doc",
  });
  assert.equal(res.created, false);
  assert.equal(res.userId, u!.id);

  const [linked] = await db.select().from(users).where(eq(users.id, u!.id)).limit(1);
  assert.equal(linked!.googleSub, "g-link"); // linked, not duplicated
  const tenantCount = (await db.select({ id: tenants.id }).from(tenants)).length;
  assert.equal(tenantCount, 1); // no extra tenant provisioned
});
