/**
 * Password reset tokens — create on request, consume to set a new password.
 *
 * Security:
 *  - The raw token (256-bit) only ever travels in the emailed link; the DB
 *    stores its SHA-256, so a DB leak yields no usable tokens.
 *  - Tokens are single-use (usedAt) and expire (default 1h).
 *  - Requesting a reset never reveals whether an email exists (the route always
 *    responds the same); this layer just returns null when there's no user.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import type { DB } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

const TTL_MS = 1000 * 60 * 60; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedReset {
  rawToken: string;
  email: string;
  userId: string;
}

/**
 * Create a reset token for `email`, if a user exists. Returns the raw token to
 * embed in the link, or null if no such user. Invalidates the user's prior
 * unused tokens so only the latest link works.
 */
export async function createResetToken(db: DB, email: string): Promise<CreatedReset | null> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  const user = rows[0];
  if (!user) return null;

  const rawToken = randomBytes(32).toString("hex");
  const id = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TTL_MS);

  return db.transaction(async (tx) => {
    // Invalidate prior unused tokens for this user (mark used).
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({ id, userId: user.id, expiresAt });
    return { rawToken, email: user.email, userId: user.id };
  });
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/** Consume a reset token and set the user's new password. Single-use + expiry checked. */
export async function consumeResetToken(
  db: DB,
  rawToken: string,
  newPassword: string,
): Promise<ConsumeResult> {
  if (!rawToken) return { ok: false, error: "Invalid or expired reset link" };
  if (newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters" };

  const id = hashToken(rawToken);
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This reset link is invalid or has expired" };
  }

  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (tx) => {
    // Re-check used/expiry inside the tx to avoid a double-use race.
    const fresh = await tx
      .select({ usedAt: passwordResetTokens.usedAt, expiresAt: passwordResetTokens.expiresAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.id, id))
      .limit(1);
    const f = fresh[0];
    if (!f || f.usedAt || f.expiresAt.getTime() < Date.now()) {
      return { ok: false, error: "This reset link is invalid or has expired" };
    }
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
    return { ok: true, userId: row.userId };
  });
}
