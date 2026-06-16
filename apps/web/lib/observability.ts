/**
 * Lightweight, dependency-free error reporting.
 *
 * If `SENTRY_DSN` is set, unhandled route errors are POSTed to Sentry's store
 * endpoint over plain fetch (no @sentry/* SDK, so nothing is pulled into the
 * bundle and there is no build/runtime coupling). If the DSN is absent — local,
 * CI, and any environment Meela hasn't configured — `reportError` only logs to
 * the console, so the app behaves identically to before.
 *
 * Swapping in the full @sentry/nextjs SDK later (source maps, tracing, release
 * health) is a "needs Meela" item: it requires a Sentry account + DSN. This
 * shim covers the "errors are captured somewhere" baseline until then.
 */
interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!projectId || !u.username) return null;
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/store/`;
    return { endpoint, publicKey: u.username };
  } catch {
    return null;
  }
}

/** Report an error. Never throws (observability must not break the request). */
export async function reportError(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // Always log locally so the error is visible in server logs.
  // eslint-disable-next-line no-console
  console.error("reportError:", message, context, stack ?? "");

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;

  try {
    await fetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=rp-shim/1.0`,
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        platform: "node",
        level: "error",
        environment: process.env.NODE_ENV ?? "production",
        message,
        extra: { ...context, stack },
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Never let reporting failures surface to the user.
  }
}
