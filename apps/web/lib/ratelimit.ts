/**
 * Minimal in-memory fixed-window rate limiter. Good enough for a single
 * instance; swap for Upstash/Redis when horizontally scaled (see plan §7).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Returns true if the action is allowed, false if the limit is exceeded.
 * @param key     unique key (e.g. "login:user@example.com")
 * @param limit   max actions per window
 * @param windowMs window length in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
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

/** Test helper: clears all buckets. */
export function _resetRateLimits(): void {
  buckets.clear();
}
