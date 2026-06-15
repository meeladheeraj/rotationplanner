import { NextResponse } from "next/server";

import {
  deleteConfig,
  getConfig,
  updateConfig,
  type ConfigPatch,
  type DepartmentInput,
} from "@/lib/data/configs";
import { handle, readJson } from "@/lib/http";
import { HttpError, requireRole, requireTenant } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

function parseDepartments(raw: unknown): DepartmentInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, "At least one department is required");
  }
  return raw.map((d, i) => {
    const o = d as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const weeks = Number(o.weeks);
    if (!name) throw new HttpError(400, `Department ${i + 1} needs a name`);
    if (!Number.isInteger(weeks) || weeks < 1) {
      throw new HttpError(400, `Department "${name}" needs a positive integer week count`);
    }
    const minCoverage = o.minCoverage === undefined ? undefined : Number(o.minCoverage);
    if (minCoverage !== undefined && (!Number.isInteger(minCoverage) || minCoverage < 1)) {
      throw new HttpError(400, `Department "${name}" minCoverage must be a positive integer`);
    }
    return { name, weeks, minCoverage };
  });
}

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const config = await getConfig(ctx, id);
  if (!config) throw new HttpError(404, "Config not found");
  return NextResponse.json({ config });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const body = await readJson(req);

  const patch: ConfigPatch = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) throw new HttpError(400, "name cannot be empty");
    patch.name = n;
  }
  if (body.nInterns !== undefined) {
    const n = Number(body.nInterns);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "nInterns must be a positive integer");
    patch.nInterns = n;
  }
  if (body.seed !== undefined) {
    patch.seed = body.seed === null ? null : Number(body.seed);
    if (patch.seed !== null && !Number.isFinite(patch.seed)) {
      throw new HttpError(400, "seed must be a number");
    }
  }
  if (body.departments !== undefined) {
    patch.departments = parseDepartments(body.departments);
  }

  const ok = await updateConfig(ctx, id, patch);
  if (!ok) throw new HttpError(404, "Config not found");
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const ok = await deleteConfig(ctx, id);
  if (!ok) throw new HttpError(404, "Config not found");
  return NextResponse.json({ ok: true });
});
