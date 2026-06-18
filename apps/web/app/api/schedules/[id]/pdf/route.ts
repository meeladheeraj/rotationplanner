import { NextResponse } from "next/server";

import { handle } from "@/lib/http";
import { HttpError, requireTenant } from "@/lib/tenant";
import { getScheduleDetail } from "@/lib/data/schedules";
import { getConfig } from "@/lib/data/configs";
import { renderRosterPdf } from "@/lib/pdf/roster";
import { coerceNameByIndex } from "@/lib/exports/names";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Render the PDF for a tenant's schedule. `nameByIndex` (FEEDBACK #8) is an
 * optional EPHEMERAL student-name mapping applied to this render only — never
 * persisted. GET produces the anonymous PDF; POST may carry the name map.
 */
async function buildResponse(nameByIndex: Record<number, string> | null, id: string) {
  const ctx = await requireTenant();
  const detail = await getScheduleDetail(ctx, id);
  if (!detail) throw new HttpError(404, "Schedule not found");
  const config = await getConfig(ctx, detail.configId);
  if (!config) throw new HttpError(404, "Config not found");

  const buf = await renderRosterPdf({
    configName: config.name,
    // Use the version's own length so leave-extended rosters export in full.
    totalWeeks: detail.stats.totalWeeks || config.totalWeeks,
    version: detail.version,
    status: detail.status,
    generatedAt: detail.generatedAt,
    assignments: detail.assignments,
    nameByIndex: nameByIndex ?? undefined,
  });

  const filename = `${config.name.replace(/[^a-z0-9]+/gi, "_")}_v${detail.version}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// GET /api/schedules/:id/pdf — download the roster as a PDF (anonymous).
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  return buildResponse(null, id);
});

// POST /api/schedules/:id/pdf — same PDF with an ephemeral name mapping applied.
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  let nameByIndex: Record<number, string> | null = null;
  try {
    const body = await req.json();
    nameByIndex = coerceNameByIndex((body as { nameByIndex?: unknown })?.nameByIndex, 100000);
  } catch {
    /* no/invalid body → anonymous */
  }
  return buildResponse(nameByIndex, id);
});
