import { NextResponse } from "next/server";

import { handle, readJson } from "@/lib/http";
import { HttpError, requireRole, requireTenant } from "@/lib/tenant";
import { createShareLink } from "@/lib/data/share";
import type { ShareScope } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/schedules/:id/share — create a read-only share link.
// Body: { scope: "full" | "per_intern", internLabel?: string }
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const body = await readJson(req);

  const scope = body.scope === "per_intern" ? "per_intern" : "full";
  const internLabel =
    typeof body.internLabel === "string" && body.internLabel.trim()
      ? body.internLabel.trim()
      : null;
  if (scope === "per_intern" && !internLabel) {
    throw new HttpError(400, "per_intern share links require an internLabel");
  }

  const link = await createShareLink(ctx, id, { scope: scope as ShareScope, internLabel });
  return NextResponse.json(link, { status: 201 });
});
