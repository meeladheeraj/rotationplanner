import { NextResponse } from "next/server";

import { handle } from "@/lib/http";
import { HttpError, requireTenant } from "@/lib/tenant";
import { getScheduleDetail } from "@/lib/data/schedules";
import { parseNameWorkbook } from "@/lib/exports/names";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/schedules/:id/names — parse an uploaded student-name spreadsheet.
 *
 * FEEDBACK #8 (EPHEMERAL MAPPING ONLY): this validates the upload against the
 * schedule's intern count and returns the parsed names to the caller. It NEVER
 * persists anything — no student-info table, no names in any DB row. The client
 * holds the returned mapping in memory and passes it to the export routes.
 * Tenant-scoped: only the owning tenant can parse against their schedule.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const detail = await getScheduleDetail(ctx, id);
  if (!detail) throw new HttpError(404, "Schedule not found");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Expected a multipart form upload with a 'file' field");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  if (file.size > 2 * 1024 * 1024) throw new HttpError(413, "File too large (max 2 MB)");

  const buf = Buffer.from(await file.arrayBuffer());
  const n = detail.assignments.length;
  const parsed = await parseNameWorkbook(buf, n);
  if (!parsed.ok) throw new HttpError(422, parsed.error);

  // Names returned to the caller for in-session use only; nothing is stored.
  return NextResponse.json({ count: parsed.rows.length, rows: parsed.rows, nameByIndex: parsed.nameByIndex });
});
