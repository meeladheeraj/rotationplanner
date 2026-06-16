/**
 * Database client (postgres-js + Drizzle).
 *
 * Lazily instantiated so the app can be imported / typechecked without a live
 * DATABASE_URL (e.g. during build or in unit tests that don't touch the DB).
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

// Stored on globalThis so the singleton is shared across Next's separately
// bundled server chunks (each route is its own bundle; a module-level `let`
// would NOT be shared, but a globalThis slot is).
const g = globalThis as typeof globalThis & { __RP_DB__?: DB };
let _client: ReturnType<typeof postgres> | null = null;

/**
 * Inject a pre-built Drizzle handle. Used only by `instrumentation.ts` under
 * `E2E_PGLITE=1` to run the real server against an in-process pglite database
 * (no live Postgres needed for end-to-end tests). A no-op in production, where
 * `getDb()` lazily connects to `DATABASE_URL`.
 */
export function setDb(db: DB): void {
  g.__RP_DB__ = db;
}

export function getDb(): DB {
  if (g.__RP_DB__) return g.__RP_DB__;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and provide a Postgres connection string.",
    );
  }
  _client = postgres(url, { prepare: false });
  g.__RP_DB__ = drizzle(_client, { schema });
  return g.__RP_DB__;
}

export { schema };
