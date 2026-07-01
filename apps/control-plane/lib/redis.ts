import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: false,
});

redis.on("error", () => { /* surfaced by health endpoint, not fatal here */ });

/** Matches the gateway's periodBucket() — must stay in sync. */
export function periodBucket(periodType: string, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  if (periodType === "daily") {
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return `${y}-${m}`;
}

/** Read the live spend counter for a budget. Returns 0 if key missing or Redis down. */
export async function readSpend(orgId: string, teamId: string | null, periodType: string): Promise<number> {
  const scope = teamId ?? "org";
  const key = `spend:${orgId}:${scope}:${periodType}:${periodBucket(periodType)}`;
  try {
    const val = await redis.get(key);
    return Number(val ?? 0);
  } catch {
    return 0;
  }
}
