import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { consumeResetToken } from "@/lib/data/password-reset";
import { checkRateLimit } from "@/lib/ratelimit";
import { asString } from "@/lib/validation";

export const runtime = "nodejs";

// POST /api/auth/reset — set a new password using a reset token.
// Body: { token: string, password: string }.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const token = asString(b.token) ?? "";
  const password = asString(b.password) ?? "";

  if (!token) return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!(await checkRateLimit(`reset:${token.slice(0, 16)}`, 10, 15 * 60_000))) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const result = await consumeResetToken(getDb(), token, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
