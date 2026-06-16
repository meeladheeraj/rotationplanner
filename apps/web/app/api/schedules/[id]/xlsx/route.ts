import { NextResponse } from "next/server";

import { handle } from "@/lib/http";
import { HttpError, requireTenant } from "@/lib/tenant";
import { getScheduleDetail } from "@/lib/data/schedules";
import { getConfig } from "@/lib/data/configs";
import { renderRosterXlsx } from "@/lib/xlsx/roster";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/schedules/:id/xlsx — download the roster as a formatted Excel workbook.
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const detail = await getScheduleDetail(ctx, id);
  if (!detail) throw new HttpError(404, "Schedule not found");
  const config = await getConfig(ctx, detail.configId);
  if (!config) throw new HttpError(404, "Config not found");

  const departments = config.departments
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => ({ name: d.name, weeks: d.weeks, minCoverage: d.minCoverage }));

  const buf = await renderRosterXlsx({
    configName: config.name,
    totalWeeks: config.totalWeeks,
    version: detail.version,
    status: detail.status,
    generatedAt: detail.generatedAt,
    assignments: detail.assignments,
    departments,
  });

  const filename = `${config.name.replace(/[^a-z0-9]+/gi, "_")}_v${detail.version}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
