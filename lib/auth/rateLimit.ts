// Lightweight in-process rate limiter for authentication endpoints.
//
// Keyed by an arbitrary string (e.g. "login:email:foo@bar.com" or
// "login:ip:1.2.3.4"). Tracks failed attempts in a sliding fixed window and
// reports when a key is locked out. Successful auth clears the key.
//
// LIMITATION: state lives in this process's memory, so it is per-instance. With
// Cloud Run scaling to a few instances it still raises the cost of credential
// stuffing dramatically, but a determined attacker spread across instances gets
// (instances × limit) attempts. For production-grade limiting, back this with a
// shared store (Redis / a Postgres table). Tracked as a follow-up.

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window expires
}

const buckets = new Map<string, Bucket>();

// Bound memory: opportunistically drop expired buckets when the map grows.
function prune(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitStatus {
  limited: boolean;
  retryAfterSec: number;
}

/**
 * Check whether `key` is currently locked out (>= `max` failures within the
 * window). Does NOT increment — call registerFailure() on an actual failure.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitStatus {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return { limited: false, retryAfterSec: 0 };
  if (b.count >= max) {
    return { limited: true, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfterSec: 0 };
}

/** Record one failed attempt against `key`, starting/extending its window. */
export function registerFailure(key: string, windowMs: number): void {
  const now = Date.now();
  prune(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    b.count += 1;
  }
}

/** Clear a key's failure record (call on successful authentication). */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
