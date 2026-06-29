/**
 * Minimal, dependency-free Google OAuth 2.0 (Authorization Code flow).
 *
 * We never expose the client secret to the browser: the secret is only used
 * server-side in `fetchProfile` to exchange the code for tokens. The id_token is
 * received directly from Google's token endpoint over TLS (server-to-server), so
 * we trust its claims without a separate JWKS signature check — we still verify
 * `aud`, `iss`, and `exp`. Feature-flagged: if the client id/secret aren't set,
 * `googleConfigured()` is false and the UI hides the button + routes 404.
 */
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Absolute callback URL, derived from APP_URL (must match the Google console). */
export function redirectUri(): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
}

/** The Google consent-screen URL to redirect the user to. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("Malformed id_token");
  const json = Buffer.from(part, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

/** Exchange the authorization code for tokens and return the verified profile. */
export async function fetchProfile(code: string): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status})`);
  }
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("No id_token in token response");

  const claims = decodeJwtPayload(tokens.id_token);
  const iss = String(claims.iss ?? "");
  if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
    throw new Error("Unexpected token issuer");
  }
  if (String(claims.aud ?? "") !== clientId) throw new Error("Token audience mismatch");
  const exp = Number(claims.exp ?? 0);
  if (!exp || exp * 1000 < Date.now()) throw new Error("Token expired");

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub || !email) throw new Error("Token missing sub/email");

  return {
    sub,
    email,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: typeof claims.name === "string" ? claims.name : null,
  };
}
