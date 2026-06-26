import { NextResponse } from "next/server";

import { handle, readJson } from "@/lib/http";
import { HttpError, requireRole, requireTenant } from "@/lib/tenant";
import { addCarryOverInterns, type CarryOverStudent } from "@/lib/data/schedules";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/schedules/:id/carryover — add carry-over students (each with only
// their pending departments) to a batch, creating a NEW draft version.
// Body: { students: [{ internLabel: string, departments: number[] }] }.
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const body = await readJson(req);

  const raw = (body as { students?: unknown }).students;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, "Provide a non-empty 'students' array");
  }
  const students: CarryOverStudent[] = raw.map((s, i) => {
    const o = s as Record<string, unknown>;
    const internLabel = typeof o.internLabel === "string" ? o.internLabel.trim() : "";
    if (!internLabel) throw new HttpError(400, `Student ${i + 1} needs a name/label`);
    const departments = Array.isArray(o.departments) ? o.departments.map((d) => Number(d)) : [];
    if (departments.length === 0) {
      throw new HttpError(400, `Student "${internLabel}" needs at least one pending department`);
    }
    return { internLabel, departments };
  });

  const result = await addCarryOverInterns(
    { db: ctx.db, tenantId: ctx.tenantId, userId: ctx.user.id },
    id,
    students,
  );
  return NextResponse.json(result, { status: 201 });
});
