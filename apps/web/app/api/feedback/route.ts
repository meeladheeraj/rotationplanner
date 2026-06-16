import { NextResponse } from "next/server";

import { createFeedback, parseFeedback, FeedbackValidationError } from "@/lib/data/feedback";
import { handle, readJson } from "@/lib/http";
import { checkRateLimit } from "@/lib/ratelimit";
import { HttpError, requireTenant } from "@/lib/tenant";

export const POST = handle(async (req: Request) => {
  const ctx = await requireTenant();

  // Light anti-spam: cap submissions per user per minute.
  if (!(await checkRateLimit(`feedback:${ctx.user.id}`, 5, 60_000))) {
    throw new HttpError(429, "Too many submissions. Please try again shortly.");
  }

  const body = await readJson(req);
  let input;
  try {
    input = parseFeedback(body);
  } catch (err) {
    if (err instanceof FeedbackValidationError) throw new HttpError(400, err.message);
    throw err;
  }

  const id = await createFeedback(
    { db: ctx.db, tenantId: ctx.tenantId, userId: ctx.user.id },
    input,
  );
  return NextResponse.json({ id }, { status: 201 });
});
