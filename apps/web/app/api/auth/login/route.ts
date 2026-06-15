import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { asString } from "@/lib/validation";

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

  // Rate-limit by email to blunt credential stuffing.
  if (!checkRateLimit(`login:${email}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429 },
    );
  }

  const db = getDb();
  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const row = rows[0];

  // Always run a verify to keep timing roughly constant whether or not the
  // user exists.
  const dummyHash =
    "scrypt$16384$00000000000000000000000000000000$00";
  const ok = await verifyPassword(password, row?.passwordHash ?? dummyHash);

  if (!row || !ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession(row.id);
  return NextResponse.json({ ok: true });
}
