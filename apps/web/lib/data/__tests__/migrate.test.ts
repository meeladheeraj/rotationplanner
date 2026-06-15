/**
 * Verifies the generated migration folder applies cleanly via a REAL Drizzle
 * migrator (not the hand-split exec used by testdb.ts), and that the expected
 * tables exist afterward. Also asserts idempotency: running it twice is a no-op.
 *
 * Uses pglite's migrator, which reads the same `_journal.json` + `*.sql` files
 * the postgres-js migrator (scripts/migrate.ts) consumes in production, so this
 * exercises the migration wiring end-to-end without a live Postgres.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "..", "..", "..", "drizzle", "migrations");

const EXPECTED_TABLES = [
  "tenants",
  "users",
  "sessions",
  "configs",
  "departments",
  "schedules",
  "assignments",
  "manual_edits",
  "share_links",
  "audit_log",
];

test("migration folder applies via the real migrator and creates all tables", async () => {
  const client = new PGlite();
  const db = drizzle(client);

  await migrate(db, { migrationsFolder });

  const rows = (await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public'`,
  )).rows.map((r) => r.table_name);

  for (const t of EXPECTED_TABLES) {
    assert.ok(rows.includes(t), `expected table "${t}" to exist after migration`);
  }
});

test("running migrations twice is idempotent (no error, no duplicate work)", async () => {
  const client = new PGlite();
  const db = drizzle(client);

  await migrate(db, { migrationsFolder });
  // Second run must not throw (already-applied migrations are skipped).
  await migrate(db, { migrationsFolder });

  const applied = (await client.query<{ count: string }>(
    `select count(*)::text as count from drizzle.__drizzle_migrations`,
  )).rows[0];
  assert.ok(applied, "drizzle migration bookkeeping table should exist");
  assert.ok(Number(applied.count) >= 1, "at least one migration should be recorded");
});
