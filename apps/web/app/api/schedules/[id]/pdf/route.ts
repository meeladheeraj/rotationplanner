import { NextResponse } from "next/server";

import { handle } from "@/lib/http";
import { HttpError, requireTenant } from "@/lib/tenant";
import { getScheduleDetail } from "@/lib/data/schedules";
import { getConfig } from "@/lib/data/configs";
import { renderRosterPdf } from "@/lib/pdf/roster";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/schedules/:id/pdf — download the roster as a PDF.
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const detail = await getScheduleDetail(ctx, id);
  if (!detail) throw new HttpError(404, "Schedule not found");
  const config = await getConfig(ctx, detail.configId);
  if (!config) throw new HttpError(404, "Config not found");

  const buf = await renderRosterPdf({
    configName: config.name,
    totalWeeks: config.totalWeeks,
    version: detail.version,
    status: detail.status,
    generatedAt: detail.generatedAt,
    assignments: detail.assignments,
  });

  const filename = `${config.name.replace(/[^a-z0-9]+/gi, "_")}_v${detail.version}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
