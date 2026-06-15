import { NextResponse } from "next/server";

import { handle } from "@/lib/http";
import { requireRole, requireTenant } from "@/lib/tenant";
import { publishSchedule } from "@/lib/data/schedules";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/schedules/:id/publish — make a draft roster immutable.
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const result = await publishSchedule(ctx, id);
  return NextResponse.json(result);
});
