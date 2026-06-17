/**
 * Next.js instrumentation hook (runs once per server process at startup).
 *
 * Production: a no-op — the app connects to `DATABASE_URL` lazily via `getDb()`.
 *
 * E2E_PGLITE=1: stand up an in-process pglite database, apply the generated
 * Drizzle migrations, and inject it into the db client. This lets the REAL
 * Next.js server (and therefore a true end-to-end HTTP / browser flow) run with
 * NO live Postgres — used by the Playwright spec and `scripts/e2e-http.ts`.
 * pglite is a devDependency and is only imported here under the flag, so it is
 * never pulled into a production build.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.E2E_PGLITE !== "1") return;

  // webpackIgnore: these node-only / dev-only modules must NOT be bundled. Next
  // compiles instrumentation for every runtime (incl. edge), and webpack would
  // otherwise fail on `node:fs`. They only ever execute in the nodejs runtime
  // under E2E_PGLITE, so leave them as native runtime imports.
  const { readFileSync, readdirSync } = await import(/* webpackIgnore: true */ "node:fs");
  const { join } = await import(/* webpackIgnore: true */ "node:path");
  const { PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite");
  const { drizzle } = await import(/* webpackIgnore: true */ "drizzle-orm/pglite");

  const { schema, setDb } = await import("@/db");
  type DB = import("@/db").DB;

  // `next start` runs with cwd = apps/web, so migrations are alongside it.
  const migrationsDir = join(process.cwd(), "drizzle", "migrations");

  const client = new PGlite(); // ephemeral, per-process
  const sqlFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of sqlFiles) {
    const raw = readFileSync(join(migrationsDir, file), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) await client.exec(stmt);
  }

  const db = drizzle(client, { schema }) as unknown as DB;
  setDb(db);
  // eslint-disable-next-line no-console
  console.log("[instrumentation] E2E_PGLITE: in-process pglite DB ready");
}
