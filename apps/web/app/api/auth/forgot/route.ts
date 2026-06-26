import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { createResetToken } from "@/lib/data/password-reset";
import { sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/ratelimit";
import { asString, isEmail } from "@/lib/validation";

export const runtime = "nodejs";

// POST /api/auth/forgot — request a password-reset link.
// Always responds 200 with the same message (no account enumeration). If the
// email maps to a user, a reset link is emailed (or logged in dev).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = asString((body as Record<string, unknown>).email)?.trim().toLowerCase() ?? "";

  const generic = NextResponse.json({
    ok: true,
    message: "If an account exists for that email, a reset link is on its way.",
  });

  if (!email || !isEmail(email)) return generic;

  // Rate-limit reset requests per email to prevent abuse/spam.
  if (!(await checkRateLimit(`forgot:${email}`, 5, 15 * 60_000))) {
    return generic; // stay generic even when throttled
  }

  const created = await createResetToken(getDb(), email);
  if (created) {
    const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "";
    const link = `${appUrl}/reset-password?token=${created.rawToken}`;
    const html = `<p>We received a request to reset your RotationPlanner password.</p>
<p><a href="${link}">Reset your password</a> (this link expires in 1 hour).</p>
<p>If you didn't request this, you can safely ignore this email.</p>`;
    const text = `Reset your RotationPlanner password (expires in 1 hour):\n${link}\n\nIf you didn't request this, ignore this email.`;
    await sendEmail({ to: created.email, subject: "Reset your RotationPlanner password", html, text });
  }

  return generic;
}
