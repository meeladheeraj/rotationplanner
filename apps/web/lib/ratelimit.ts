/**
 * Rate limiter with a pluggable backend.
 *
 * Default: an in-memory fixed-window counter pinned on `globalThis` so it
 * survives module duplication / dev HMR within a single instance.
 *
 * Production / horizontally-scaled: if `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set, the counter is kept in Upstash Redis over
 * its REST API (no SDK dependency — plain fetch), so the limit is shared across
 * every instance and survives restarts. If Upstash errors, we FAIL OPEN to the
 * in-memory limiter rather than locking users out during a backend outage.
 *
 * See enterprise plan §7 ("Rate-limit auth endpoints — in-memory or upstash").
 */
interface Bucket {
  count: number;
  resetAt: number;
}

// globalThis-pinned so the map isn't reset by bundling / HMR within an instance.
const g = globalThis as typeof globalThis & { __RP_RL__?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__RP_RL__ ??= new Map());

function checkInMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/**
 * Atomically INCR a key in Upstash and set its TTL on first use. Returns the
 * post-increment count, or null on any error (caller falls back to in-memory).
 */
async function upstashIncr(
  cfg: { url: string; token: string },
  key: string,
  windowSec: number,
): Promise<number | null> {
  try {
    // Pipeline: INCR rl:<key> ; EXPIRE rl:<key> <ttl> NX  (set TTL only if unset)
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["EXPIRE", `rl:${key}`, String(windowSec), "NX"],
      ]),
      // Don't hang the request path on a slow limiter backend.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as Array<{ result?: number; error?: string }>;
    const incr = out[0];
    if (!incr || typeof incr.result !== "number") return null;
    return incr.result;
  } catch {
    return null;
  }
}

/**
 * Returns true if the action is allowed, false if the limit is exceeded.
 * @param key      unique key (e.g. "login:user@example.com")
 * @param limit    max actions per window
 * @param windowMs window length in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const cfg = upstashConfig();
  if (cfg) {
    const count = await upstashIncr(cfg, key, Math.ceil(windowMs / 1000));
    if (count !== null) return count <= limit;
    // Upstash unavailable → fall through to in-memory (fail open to local).
  }
  return checkInMemory(key, limit, windowMs);
}

/** Test helper: clears all in-memory buckets. */
export function _resetRateLimits(): void {
  buckets.clear();
}
