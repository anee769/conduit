/**
 * Small in-memory rate limiter for the dashboard's login endpoint.
 *
 * Self-hosted Conduit dashboards typically run as a single Next.js process,
 * so a Map keyed by (ip + window) is sufficient. Multi-instance deployments
 * should put a real rate-limiting reverse proxy (Cloudflare, nginx with
 * limit_req, etc.) in front — that's the right altitude for org-scale
 * throttling anyway.
 *
 * Sliding-window counter: each unique key holds an array of attempt
 * timestamps within the last `windowMs`. Attempts older than the window are
 * discarded lazily on each call so memory stays bounded.
 */

type Bucket = number[];
const buckets = new Map<string, Bucket>();

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 5;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

/**
 * Record an attempt for `key` and return whether it's allowed. Pure-ish:
 * mutates the in-memory bucket but returns a serializable result the caller
 * can use to set HTTP headers or render a UI message.
 */
export function check(key: string, maxAttempts = DEFAULT_MAX_ATTEMPTS, windowMs = DEFAULT_WINDOW_MS): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (bucket.length >= maxAttempts) {
    const oldest = bucket[0] ?? now;
    const retryAfterMs = oldest + windowMs - now;
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: maxAttempts - bucket.length, retryAfterSec: 0 };
}

/** Drop a key's history — call on successful auth so a legit user isn't stuck. */
export function reset(key: string): void {
  buckets.delete(key);
}

/** Best-effort client IP. Trusts standard reverse-proxy headers when present. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
