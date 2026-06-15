/**
 * Tenant-scoped data access for configs + their departments.
 *
 * EVERY query here filters by ctx.tenantId. This is the single chokepoint that
 * enforces tenant isolation; route handlers never query these tables directly.
 */
import { and, asc, eq } from "drizzle-orm";

import type { DB } from "@/db";
import { configs, departments } from "@/db/schema";
import { writeAudit } from "@/lib/audit";

export interface DataCtx {
  db: DB;
  tenantId: string;
  userId?: string | null;
}

export interface DepartmentInput {
  name: string;
  weeks: number;
  minCoverage?: number;
}

export interface ConfigInput {
  name: string;
  nInterns: number;
  seed?: number | null;
  departments: DepartmentInput[];
}

export interface ConfigRecord {
  id: string;
  name: string;
  totalWeeks: number;
  nInterns: number;
  seed: number | null;
  createdAt: Date;
  updatedAt: Date;
  departments: {
    id: string;
    name: string;
    weeks: number;
    minCoverage: number;
    sortOrder: number;
  }[];
}

function totalWeeksOf(depts: DepartmentInput[]): number {
  return depts.reduce((sum, d) => sum + d.weeks, 0);
}

export async function createConfig(
  ctx: DataCtx,
  input: ConfigInput,
): Promise<string> {
  const totalWeeks = totalWeeksOf(input.departments);
  return ctx.db.transaction(async (tx) => {
    const [cfg] = await tx
      .insert(configs)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        totalWeeks,
        nInterns: input.nInterns,
        seed: input.seed ?? null,
        createdBy: ctx.userId ?? null,
      })
      .returning({ id: configs.id });
    if (!cfg) throw new Error("Failed to create config");

    if (input.departments.length > 0) {
      await tx.insert(departments).values(
        input.departments.map((d, i) => ({
          configId: cfg.id,
          name: d.name,
          weeks: d.weeks,
          minCoverage: d.minCoverage ?? 2,
          sortOrder: i,
        })),
      );
    }
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "create",
      entityType: "config",
      entityId: cfg.id,
      metadata: { name: input.name, nInterns: input.nInterns, totalWeeks },
    });
    return cfg.id;
  });
}

export async function listConfigs(ctx: DataCtx): Promise<ConfigRecord[]> {
  const rows = await ctx.db
    .select()
    .from(configs)
    .where(eq(configs.tenantId, ctx.tenantId))
    .orderBy(asc(configs.createdAt));
  const result: ConfigRecord[] = [];
  for (const r of rows) {
    result.push({ ...toConfigShell(r), departments: await loadDepartments(ctx.db, r.id) });
  }
  return result;
}

export async function getConfig(
  ctx: DataCtx,
  id: string,
): Promise<ConfigRecord | null> {
  const rows = await ctx.db
    .select()
    .from(configs)
    .where(and(eq(configs.id, id), eq(configs.tenantId, ctx.tenantId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { ...toConfigShell(r), departments: await loadDepartments(ctx.db, r.id) };
}

export interface ConfigPatch {
  name?: string;
  nInterns?: number;
  seed?: number | null;
  departments?: DepartmentInput[];
}

/** Returns true if a row was updated (i.e. it belonged to this tenant). */
export async function updateConfig(
  ctx: DataCtx,
  id: string,
  patch: ConfigPatch,
): Promise<boolean> {
  return ctx.db.transaction(async (tx) => {
    // Tenant-scoped existence check first.
    const existing = await tx
      .select({ id: configs.id })
      .from(configs)
      .where(and(eq(configs.id, id), eq(configs.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing[0]) return false;

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.nInterns !== undefined) set.nInterns = patch.nInterns;
    if (patch.seed !== undefined) set.seed = patch.seed;
    if (patch.departments) set.totalWeeks = totalWeeksOf(patch.departments);

    await tx
      .update(configs)
      .set(set)
      .where(and(eq(configs.id, id), eq(configs.tenantId, ctx.tenantId)));

    if (patch.departments) {
      await tx.delete(departments).where(eq(departments.configId, id));
      if (patch.departments.length > 0) {
        await tx.insert(departments).values(
          patch.departments.map((d, i) => ({
            configId: id,
            name: d.name,
            weeks: d.weeks,
            minCoverage: d.minCoverage ?? 2,
            sortOrder: i,
          })),
        );
      }
    }
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "update",
      entityType: "config",
      entityId: id,
      metadata: patch,
    });
    return true;
  });
}

/** Returns true if a row was deleted (i.e. it belonged to this tenant). */
export async function deleteConfig(ctx: DataCtx, id: string): Promise<boolean> {
  return ctx.db.transaction(async (tx) => {
    const deleted = await tx
      .delete(configs)
      .where(and(eq(configs.id, id), eq(configs.tenantId, ctx.tenantId)))
      .returning({ id: configs.id });
    if (!deleted[0]) return false;
    await writeAudit(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "delete",
      entityType: "config",
      entityId: id,
    });
    return true;
  });
}

// --- helpers ---------------------------------------------------------------

type ConfigRow = typeof configs.$inferSelect;

function toConfigShell(r: ConfigRow): Omit<ConfigRecord, "departments"> {
  return {
    id: r.id,
    name: r.name,
    totalWeeks: r.totalWeeks,
    nInterns: r.nInterns,
    seed: r.seed,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function loadDepartments(db: DB, configId: string) {
  const rows = await db
    .select()
    .from(departments)
    .where(eq(departments.configId, configId))
    .orderBy(asc(departments.sortOrder));
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    weeks: d.weeks,
    minCoverage: d.minCoverage,
    sortOrder: d.sortOrder,
  }));
}
