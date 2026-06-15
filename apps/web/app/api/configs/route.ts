import { NextResponse } from "next/server";
import { getPreset } from "@rp/engine";

import { createConfig, listConfigs, type DepartmentInput } from "@/lib/data/configs";
import { handle, readJson } from "@/lib/http";
import { HttpError, requireTenant } from "@/lib/tenant";

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

export const GET = handle(async () => {
  const ctx = await requireTenant();
  const configs = await listConfigs(ctx);
  return NextResponse.json({ configs });
});

export const POST = handle(async (req: Request) => {
  const ctx = await requireTenant();
  const body = await readJson(req);

  const presetId = typeof body.presetId === "string" ? body.presetId : null;
  let departments: DepartmentInput[];
  let defaultName = "Untitled config";

  if (presetId) {
    const preset = getPreset(presetId);
    if (!preset) throw new HttpError(400, `Unknown preset: ${presetId}`);
    departments = preset.departments.map((d) => ({
      name: d.name,
      weeks: d.weeks,
      minCoverage: d.minCoverage,
    }));
    defaultName = preset.name;
  } else {
    departments = parseDepartments(body.departments);
  }

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : defaultName;
  const nInterns = Number(body.nInterns);
  if (!Number.isInteger(nInterns) || nInterns < 1) {
    throw new HttpError(400, "nInterns must be a positive integer");
  }
  const seed =
    body.seed === undefined || body.seed === null ? null : Number(body.seed);
  if (seed !== null && !Number.isFinite(seed)) {
    throw new HttpError(400, "seed must be a number");
  }

  const id = await createConfig(ctx, { name, nInterns, seed, departments });
  return NextResponse.json({ id }, { status: 201 });
});
