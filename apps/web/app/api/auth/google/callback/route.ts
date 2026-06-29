import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { resolveOrCreateGoogleUser } from "@/lib/data/google-auth";
import { fetchProfile, googleConfigured } from "@/lib/oauth/google";
import { createSession } from "@/lib/session";

export const runtime = "nodejs";

const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";
const back = (q: string) => NextResponse.redirect(new URL(`/login?error=${q}`, APP_URL()));

/** OAuth redirect target: verifies state, exchanges code, signs the user in. */
export async function GET(req: Request) {
  if (!googleConfigured()) return back("google_unavailable");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expected = jar.get("g_oauth_state")?.value;
  jar.delete("g_oauth_state");

  if (!code || !state || !expected || state !== expected) return back("oauth_state");

  try {
    const profile = await fetchProfile(code);
    if (!profile.emailVerified) return back("email_unverified");
    const { userId } = await resolveOrCreateGoogleUser(getDb(), profile);
    await createSession(userId);
    return NextResponse.redirect(new URL("/dashboard", APP_URL()));
  } catch {
    return back("oauth");
  }
}
