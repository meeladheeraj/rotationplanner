import { NextResponse } from "next/server";

import { handle, readJson } from "@/lib/http";
import { HttpError, requireRole, requireTenant } from "@/lib/tenant";
import {
  saveSchedule,
  type SubmittedAssignment,
} from "@/lib/data/schedules";
import type { AssignmentBlock } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

function parseAssignments(raw: unknown): SubmittedAssignment[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, "assignments must be a non-empty array");
  }
  return raw.map((a, i) => {
    const o = a as Record<string, unknown>;
    const internIndex = Number(o.internIndex);
    const internLabel = typeof o.internLabel === "string" ? o.internLabel : `Intern ${i + 1}`;
    if (!Number.isInteger(internIndex) || internIndex < 0) {
      throw new HttpError(400, `assignment ${i} has an invalid internIndex`);
    }
    if (!Array.isArray(o.rotation)) {
      throw new HttpError(400, `assignment ${i} is missing a rotation array`);
    }
    const rotation: AssignmentBlock[] = (o.rotation as unknown[]).map((b) => {
      const blk = b as Record<string, unknown>;
      const dept = Number(blk.dept);
      const start = Number(blk.start);
      const end = Number(blk.end);
      const deptName = typeof blk.deptName === "string" ? blk.deptName : "";
      if (![dept, start, end].every(Number.isInteger)) {
        throw new HttpError(400, `assignment ${i} has a malformed rotation block`);
      }
      return { dept, deptName, start, end };
    });
    return { internIndex, internLabel, rotation };
  });
}

// POST /api/configs/:id/schedules — save a client-generated schedule.
// Server RE-VALIDATES via @rp/engine before persisting (plan §4).
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const ctx = await requireTenant();
  requireRole(ctx.user, "owner", "admin");
  const { id } = await params;
  const body = await readJson(req);

  const assignments = parseAssignments(body.assignments);
  const engineVersion = typeof body.engineVersion === "string" ? body.engineVersion : undefined;

  const result = await saveSchedule(ctx, id, { assignments, engineVersion });
  return NextResponse.json(result, { status: 201 });
});
