/**
 * Feedback collection: tenant-scoped insert, validation, and audit trail.
 * Runs against a real (in-memory) Postgres via pglite, applying the generated
 * migrations — which also verifies the 0001_add_feedback migration SQL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { and, eq } from "drizzle-orm";

import type { DB } from "@/db";
import { auditLog, feedback, tenants, users } from "@/db/schema";
import {
  createFeedback,
  parseFeedback,
  FeedbackValidationError,
  type FeedbackDataCtx,
} from "@/lib/data/feedback";

import { makeTestDb } from "./testdb";

async function seedTenant(db: DB, name: string): Promise<{ tenantId: string; userId: string }> {
  const [t] = await db
    .insert(tenants)
    .values({ name, slug: name.toLowerCase() })
    .returning({ id: tenants.id });
  assert.ok(t);
  const [u] = await db
    .insert(users)
    .values({ tenantId: t.id, email: `${name.toLowerCase()}@example.com`, passwordHash: "x", role: "owner" })
    .returning({ id: users.id });
  assert.ok(u);
  return { tenantId: t.id, userId: u.id };
}

test("createFeedback persists a tenant-scoped row + audit entry", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const a = await seedTenant(db, "Alpha");
  const ctx: FeedbackDataCtx = { db, tenantId: a.tenantId, userId: a.userId };

  const id = await createFeedback(ctx, { category: "idea", rating: 5, message: "Add dark mode" });
  assert.ok(id);

  const rows = await db.select().from(feedback).where(eq(feedback.tenantId, a.tenantId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.category, "idea");
  assert.equal(rows[0]?.rating, 5);
  assert.equal(rows[0]?.message, "Add dark mode");
  assert.equal(rows[0]?.userId, a.userId);

  const audits = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, a.tenantId), eq(auditLog.action, "feedback_submitted")));
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.entityId, id);
});

test("feedback is isolated per tenant", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const a = await seedTenant(db, "Alpha");
  const b = await seedTenant(db, "Beta");

  await createFeedback({ db, tenantId: a.tenantId, userId: a.userId }, {
    category: "bug",
    rating: null,
    message: "Export button is broken",
  });

  const bRows = await db.select().from(feedback).where(eq(feedback.tenantId, b.tenantId));
  assert.equal(bRows.length, 0, "tenant B must not see tenant A's feedback");
});

test("rating defaults to null and is preserved", async () => {
  const { db: rawDb } = await makeTestDb();
  const db = rawDb as unknown as DB;
  const a = await seedTenant(db, "Alpha");
  const id = await createFeedback({ db, tenantId: a.tenantId, userId: a.userId }, {
    category: "other",
    rating: null,
    message: "Just saying hi",
  });
  const [row] = await db.select().from(feedback).where(eq(feedback.id, id));
  assert.equal(row?.rating, null);
});

test("parseFeedback validates category, rating range, and message length", () => {
  assert.throws(() => parseFeedback({ category: "spam", message: "hello there" }), FeedbackValidationError);
  assert.throws(() => parseFeedback({ category: "bug", rating: 6, message: "hello there" }), FeedbackValidationError);
  assert.throws(() => parseFeedback({ category: "bug", rating: 0, message: "hello there" }), FeedbackValidationError);
  assert.throws(() => parseFeedback({ category: "idea", message: "x" }), FeedbackValidationError);

  const ok = parseFeedback({ category: "idea", rating: "4", message: "  great app  " });
  assert.equal(ok.category, "idea");
  assert.equal(ok.rating, 4);
  assert.equal(ok.message, "great app");

  const noRating = parseFeedback({ category: "other", message: "no rating here" });
  assert.equal(noRating.rating, null);
});
