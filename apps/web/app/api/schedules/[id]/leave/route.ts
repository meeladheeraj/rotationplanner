import { NextResponse } from "next/server";

import { handle, readJson } from "@/lib/http";
import { HttpError, requireRole, requireTenant } from "@/lib/tenant";
import { applyLeaveToSchedule } from "@/lib/data/schedules";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/schedules/:id/leave — apply an intern leave to a saved schedule,
// producing a NEW draft version (the source version is left untouched).
// Body: { internIndex: number, startWeek: number, leaveWeeks: number }.
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const body = await readJson(req);

  const internIndex = Number(body.internIndex);
  const startWeek = Number(body.startWeek);
  const leaveWeeks = Number(body.leaveWeeks);
  if (!Number.isInteger(internIndex) || internIndex < 0) {
    throw new HttpError(400, "internIndex must be a non-negative integer");
  }
  if (!Number.isInteger(startWeek) || startWeek < 0) {
    throw new HttpError(400, "startWeek must be a non-negative integer");
  }
  if (!Number.isInteger(leaveWeeks) || leaveWeeks < 1) {
    throw new HttpError(400, "leaveWeeks must be a positive integer");
  }

  const result = await applyLeaveToSchedule(
    { db: ctx.db, tenantId: ctx.tenantId, userId: ctx.user.id },
    id,
    internIndex,
    startWeek,
    leaveWeeks,
  );
  return NextResponse.json(result, { status: 201 });
});
