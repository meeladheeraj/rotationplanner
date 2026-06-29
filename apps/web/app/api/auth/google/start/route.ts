import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildAuthUrl, googleConfigured } from "@/lib/oauth/google";

export const runtime = "nodejs";

const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

/** Kicks off Google OAuth: sets a short-lived state cookie, redirects to consent. */
export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_unavailable", APP_URL()));
  }
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  });
  return NextResponse.redirect(buildAuthUrl(state));
}
