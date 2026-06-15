import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { tenants, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { asString, isEmail, slugify } from "@/lib/validation";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const email = asString(b.email)?.trim().toLowerCase() ?? "";
  const password = asString(b.password) ?? "";
  const tenantName = asString(b.tenantName)?.trim() || "My Organization";

  if (!isEmail(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const slug = `${slugify(tenantName)}-${randomBytes(3).toString("hex")}`;
  const passwordHash = await hashPassword(password);

  const userId = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: tenantName, slug })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error("Failed to create tenant");
    const [user] = await tx
      .insert(users)
      .values({ tenantId: tenant.id, email, passwordHash, role: "owner" })
      .returning({ id: users.id });
    if (!user) throw new Error("Failed to create user");
    await writeAudit(tx, {
      tenantId: tenant.id,
      userId: user.id,
      action: "register",
      entityType: "user",
      entityId: user.id,
    });
    return user.id;
  });

  await createSession(userId);
  return NextResponse.json({ ok: true }, { status: 201 });
}
