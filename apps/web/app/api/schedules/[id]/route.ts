import { NextResponse } from "next/server";

import { handle } from "@/lib/http";
import { HttpError, requireTenant } from "@/lib/tenant";
import { getScheduleDetail } from "@/lib/data/schedules";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/schedules/:id — a single schedule version + its assignments.
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const detail = await getScheduleDetail(ctx, id);
  if (!detail) throw new HttpError(404, "Schedule not found");
  return NextResponse.json({ schedule: detail });
});
