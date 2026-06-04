import Redis from "ioredis";
import pino from "pino";

const logger = pino({ name: "redis" });

/**
 * Shared Redis connection for live budget counters.
 *
 * `enableOfflineQueue: false` + a low retry ceiling means commands fail FAST
 * when Redis is unreachable instead of queueing — the budget layer catches that
 * and fails OPEN (cost control must never take down the data path).
 */
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: false,
});

// Without a handler, a connection error would crash the process.
redis.on("error", (err) => logger.warn({ err: String(err) }, "redis error"));

export async function pingRedis(): Promise<boolean> {
  return (await redis.ping()) === "PONG";
}
