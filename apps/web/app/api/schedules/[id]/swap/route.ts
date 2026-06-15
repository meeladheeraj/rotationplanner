import { NextResponse } from "next/server";

import { handle, readJson } from "@/lib/http";
import { HttpError, requireRole, requireTenant } from "@/lib/tenant";
import { applyManualSwap } from "@/lib/data/schedules";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/schedules/:id/swap — exchange two interns' rotations on a draft.
// Body: { internIndexA: number, internIndexB: number }. The engine re-validates
// the whole roster before anything persists; published schedules are refused.
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const body = await readJson(req);

  const a = Number(body.internIndexA);
  const b = Number(body.internIndexB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    throw new HttpError(400, "internIndexA and internIndexB must be non-negative integers");
  }

  const result = await applyManualSwap(ctx, id, a, b);
  return NextResponse.json(result);
});
