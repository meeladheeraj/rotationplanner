/**
 * Resolve a Google profile to a local user, creating a tenant + owner on first
 * sign-in. Linking rules:
 *   1. Match by google_sub  → return that user.
 *   2. Else match by email  → link google_sub to the existing account, return it.
 *      (Lets a password user adopt Google sign-in seamlessly.)
 *   3. Else auto-provision   → new tenant + owner user (no password), audited.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import type { DB } from "@/db";
import { tenants, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/validation";

export interface GoogleUserInput {
  sub: string;
  email: string;
  name?: string | null;
}

export interface ResolvedGoogleUser {
  userId: string;
  created: boolean;
}

export async function resolveOrCreateGoogleUser(
  db: DB,
  input: GoogleUserInput,
): Promise<ResolvedGoogleUser> {
  const email = input.email.trim().toLowerCase();

  // 1. Already linked by Google subject id.
  const bySub = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleSub, input.sub))
    .limit(1);
  if (bySub[0]) return { userId: bySub[0].id, created: false };

  // 2. An account with this email exists — link Google to it.
  const byEmail = await db
    .select({ id: users.id, googleSub: users.googleSub })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (byEmail[0]) {
    if (!byEmail[0].googleSub) {
      await db.update(users).set({ googleSub: input.sub }).where(eq(users.id, byEmail[0].id));
    }
    return { userId: byEmail[0].id, created: false };
  }

  // 3. Brand-new — provision a tenant + owner user (passwordless).
  const tenantName = input.name?.trim() ? `${input.name.trim()}'s Organization` : "My Organization";
  const slug = `${slugify(tenantName)}-${randomBytes(3).toString("hex")}`;

  const userId = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: tenantName, slug })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error("Failed to create tenant");
    const [user] = await tx
      .insert(users)
      .values({ tenantId: tenant.id, email, googleSub: input.sub, role: "owner" })
      .returning({ id: users.id });
    if (!user) throw new Error("Failed to create user");
    await writeAudit(tx, {
      tenantId: tenant.id,
      userId: user.id,
      action: "register_google",
      entityType: "user",
      entityId: user.id,
    });
    return user.id;
  });

  return { userId, created: true };
}
