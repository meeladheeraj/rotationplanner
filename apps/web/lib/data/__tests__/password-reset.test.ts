/**
 * Password reset tokens (pglite): create → consume sets the new password;
 * expired/used/unknown tokens are rejected; unknown email returns null without
 * leaking existence.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import { passwordResetTokens, tenants, users } from "@/db/schema";
import { createResetToken, consumeResetToken } from "@/lib/data/password-reset";
import { hashPassword, verifyPassword } from "@/lib/password";

import { makeTestDb } from "./testdb";

async function seedUser(db: DB, email: string) {
  const [t] = await db.insert(tenants).values({ name: "T", slug: `t-${email}` }).returning({ id: tenants.id });
  const initial = await hashPassword("oldpassword1");
  const [u] = await db
    .insert(users)
    .values({ tenantId: t!.id, email, passwordHash: initial, role: "owner" })
    .returning({ id: users.id });
  return u!.id;
}

test("create + consume resets the password and is single-use", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const userId = await seedUser(db, "a@example.com");

  const created = await createResetToken(db, "A@Example.com"); // case-insensitive
  assert.ok(created);
  assert.equal(created!.userId, userId);

  const r = await consumeResetToken(db, created!.rawToken, "brandnewpass1");
  assert.equal(r.ok, true);

  const [row] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, userId));
  assert.equal(await verifyPassword("brandnewpass1", row!.h), true);
  assert.equal(await verifyPassword("oldpassword1", row!.h), false);

  // token cannot be reused
  const again = await consumeResetToken(db, created!.rawToken, "anotherpass1");
  assert.equal(again.ok, false);
});

test("unknown email returns null (no enumeration)", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  await seedUser(db, "real@example.com");
  const created = await createResetToken(db, "nobody@example.com");
  assert.equal(created, null);
});

test("expired and unknown tokens are rejected; short passwords too", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  await seedUser(db, "b@example.com");

  assert.equal((await consumeResetToken(db, "totally-unknown", "longenough1")).ok, false);

  const created = await createResetToken(db, "b@example.com");
  assert.equal((await consumeResetToken(db, created!.rawToken, "short")).ok, false, "rejects <8 char password");

  // expire the token by hand, then it must be rejected
  const { createHash } = await import("node:crypto");
  const id = createHash("sha256").update(created!.rawToken).digest("hex");
  await db
    .update(passwordResetTokens)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(passwordResetTokens.id, id));
  assert.equal((await consumeResetToken(db, created!.rawToken, "longenough1")).ok, false, "rejects expired");
});

test("requesting a new token invalidates the previous one", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  await seedUser(db, "c@example.com");

  const first = await createResetToken(db, "c@example.com");
  const second = await createResetToken(db, "c@example.com");
  assert.ok(first && second);

  assert.equal((await consumeResetToken(db, first!.rawToken, "longenough1")).ok, false, "old link invalid");
  assert.equal((await consumeResetToken(db, second!.rawToken, "longenough1")).ok, true, "newest link works");
});
