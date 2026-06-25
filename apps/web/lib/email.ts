/**
 * Lightweight, dependency-free transactional email.
 *
 * If `RESEND_API_KEY` is set, mail is sent via Resend's REST API over plain
 * fetch (no SDK pulled into the bundle). If it's absent — local, CI, or any
 * environment not yet configured — `sendEmail` logs the message (subject + body)
 * to the server console so flows like password reset are still testable end to
 * end. Never throws: a mail failure must not break the request that triggered it.
 *
 * To send real email, set:
 *   RESEND_API_KEY  — from resend.com
 *   EMAIL_FROM      — a verified sender, e.g. "RotationPlanner <noreply@yourdomain>"
 *                     (defaults to Resend's onboarding@resend.dev sandbox sender)
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "RotationPlanner <onboarding@resend.dev>";

  if (!key) {
    // eslint-disable-next-line no-console
    console.info(
      `[email:dev] (no RESEND_API_KEY) would send to ${msg.to}\n  subject: ${msg.subject}\n  ${msg.text ?? msg.html}`,
    );
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[email] Resend responded ${res.status}: ${await res.text().catch(() => "")}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[email] send failed:", err);
    return { ok: false };
  }
}
