import pino from "pino";
import { redis } from "../budget/redis";

/**
 * Per-virtual-key request rate limiting (fixed 60s window in Redis).
 *
 * A coding agent stuck in a retry loop can hammer the gateway; rate_limit_rpm
 * on the key caps that. Fail-open: if Redis can't be reached we allow the
 * request rather than block traffic on a cache blip.
 */

const logger = pino({ name: "ratelimit" });

export type RateResult = { limited: boolean; limit: number; current: number };

export async function checkRateLimit(vkId: string, rpm: number | null): Promise<RateResult> {
  if (!rpm || rpm <= 0) return { limited: false, limit: 0, current: 0 }; // null = unlimited
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `rl:${vkId}:${bucket}`;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 90); // outlive the window, then self-clean
    return { limited: n > rpm, limit: rpm, current: n };
  } catch (err) {
    logger.warn({ err: String(err) }, "rate limit check failed — failing open");
    return { limited: false, limit: rpm, current: 0 };
  }
}
