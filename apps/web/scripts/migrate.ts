/**
 * Idempotent database migration runner.
 *
 * Applies every pending Drizzle migration in `drizzle/migrations` against the
 * Postgres database pointed to by `DATABASE_URL`. Safe to run repeatedly and on
 * boot: Drizzle records applied migrations in its `__drizzle_migrations` table
 * and skips ones already run.
 *
 * Usage:
 *   DATABASE_URL=postgres://… pnpm db:migrate         (see package.json)
 *   or directly:  tsx scripts/migrate.ts
 *
 * Exits non-zero on failure so it can gate a deploy / container start.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "..", "drizzle", "migrations");

export async function runMigrations(url: string): Promise<void> {
  // `max: 1` — a single connection is correct for migrations (avoids lock
  // contention); `prepare: false` keeps it compatible with poolers like PgBouncer.
  const client = postgres(url, { max: 1, prepare: false });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and provide a Postgres connection string.",
    );
    process.exit(1);
  }
  const started = Date.now();
  console.log("[migrate] applying pending migrations…");
  await runMigrations(url);
  console.log(`[migrate] done in ${Date.now() - started}ms`);
}

// Run only when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
}
