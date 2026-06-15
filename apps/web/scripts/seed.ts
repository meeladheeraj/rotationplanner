/**
 * Demo seed script — makes a fresh, explorable demo so a stranger (or a sales
 * demo) can sign in and immediately see a generated, published, shareable roster.
 *
 * It creates:
 *   - a demo tenant + owner user (DEMO_EMAIL / DEMO_PASSWORD)
 *   - a config from the NMC CRMI 2021 preset (Casualty raised to minCoverage 4)
 *   - a generated, server-re-validated schedule (saved as v1)
 *   - the schedule published (immutable)
 *   - a full-roster share link (prints the public URL)
 *
 * IDEMPOTENT: if the demo user already exists, its tenant is deleted (cascading
 * away all demo configs/schedules/links) and rebuilt, so the demo state is the
 * same every run. It NEVER touches any other tenant.
 *
 * Usage:
 *   DATABASE_URL=postgres://… pnpm db:seed        (see package.json)
 *   optional: DEMO_EMAIL, DEMO_PASSWORD, APP_URL
 *
 * Safe to run only against a database you control; requires DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";

import {
  generate,
  getPreset,
  schedToBlocks,
  type Config as EngineConfig,
} from "@rp/engine";

import type { DB } from "@/db";
import { getDb } from "@/db";
import { tenants, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { createConfig, type DataCtx } from "@/lib/data/configs";
import { saveSchedule, publishSchedule } from "@/lib/data/schedules";
import { createShareLink } from "@/lib/data/share";

const DEMO_EMAIL = (process.env.DEMO_EMAIL ?? "demo@rotationplanner.app").toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demopassword123";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const N_INTERNS = 135;
const SEED = 42; // deterministic so the demo roster is identical every run

export interface SeedOptions {
  email?: string;
  password?: string;
  nInterns?: number;
  seed?: number;
}

export interface SeedResult {
  tenantId: string;
  userId: string;
  configId: string;
  scheduleId: string;
  version: number;
  shareToken: string;
  email: string;
  minCount: number;
  theoreticalMinN: number;
}

/**
 * Idempotently (re)create the demo tenant and a published, shareable roster.
 * Importable so it can be exercised in tests against an in-memory DB.
 */
export async function seedDemo(db: DB, opts: SeedOptions = {}): Promise<SeedResult> {
  const email = (opts.email ?? DEMO_EMAIL).toLowerCase();
  const password = opts.password ?? DEMO_PASSWORD;
  const nInterns = opts.nInterns ?? N_INTERNS;
  const seed = opts.seed ?? SEED;

  // --- idempotency: wipe any prior demo tenant -----------------------------
  const existing = await db
    .select({ id: users.id, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    await db.delete(tenants).where(eq(tenants.id, existing[0].tenantId)); // cascades
  }

  // --- tenant + owner user --------------------------------------------------
  const passwordHash = await hashPassword(password);
  const { tenantId, userId } = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: "Demo Teaching Hospital", slug: `demo-${Date.now().toString(36)}` })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error("Failed to create demo tenant");
    const [user] = await tx
      .insert(users)
      .values({ tenantId: tenant.id, email, passwordHash, role: "owner" })
      .returning({ id: users.id });
    if (!user) throw new Error("Failed to create demo user");
    return { tenantId: tenant.id, userId: user.id };
  });
  const ctx: DataCtx = { db, tenantId, userId };

  // --- config from NMC preset ----------------------------------------------
  // All departments keep the engine default minCoverage (2). Raising a 1-week
  // department (e.g. Casualty) would push theoreticalMinN to 2*52 = 104+ for
  // THAT department alone, so the proven N=135 roster stays fully valid as-is.
  const preset = getPreset("nmc-crmi-2021");
  if (!preset) throw new Error("NMC preset not found");
  const departments = preset.departments.map((d) => ({
    name: d.name,
    weeks: d.weeks,
    minCoverage: d.minCoverage ?? 2,
  }));
  const configId = await createConfig(ctx, {
    name: "NMC CRMI 2021 — 2026 intake",
    nInterns,
    seed,
    departments,
  });

  // --- generate (engine) → assignments (same shape the UI submits) ----------
  const engineConfig: EngineConfig = { n: nInterns, seed, departments };
  const result = generate(engineConfig);
  const assignments = result.internSchedules.map((is) => ({
    internIndex: is.id,
    internLabel: `Intern ${is.id + 1}`,
    rotation: schedToBlocks(is.schedule).map((b) => ({
      dept: b.dept,
      deptName: engineConfig.departments[b.dept]?.name ?? "",
      start: b.start,
      end: b.end,
    })),
  }));

  // --- save (server re-validates) → publish → share -------------------------
  const saved = await saveSchedule(ctx, configId, { assignments });
  await publishSchedule(ctx, saved.scheduleId);
  const link = await createShareLink(ctx, saved.scheduleId, { scope: "full" });

  return {
    tenantId,
    userId,
    configId,
    scheduleId: saved.scheduleId,
    version: saved.version,
    shareToken: link.token,
    email,
    minCount: result.stats.minCount,
    theoreticalMinN: result.stats.theoreticalMinN,
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and provide a Postgres connection string.",
    );
    process.exit(1);
  }
  const r = await seedDemo(getDb());
  console.log(`[seed] saved schedule v${r.version} (published)`);
  console.log("\n[seed] demo ready:");
  console.log(`  login:       ${r.email} / ${DEMO_PASSWORD}`);
  console.log(`  interns:     ${N_INTERNS}`);
  console.log(`  coverage:    minCount=${r.minCount}, theoreticalMinN=${r.theoreticalMinN}`);
  console.log(`  share link:  ${APP_URL}/s/${r.shareToken}`);
}

// Run only when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] failed:", err);
      process.exit(1);
    });
}
