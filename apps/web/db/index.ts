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

let _db: DB | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and provide a Postgres connection string.",
    );
  }
  _client = postgres(url, { prepare: false });
  _db = drizzle(_client, { schema });
  return _db;
}

export { schema };
