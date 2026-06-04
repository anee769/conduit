/** Period helpers for budget counters — all UTC so buckets are unambiguous. */

export type PeriodType = "daily" | "monthly";

/** Bucket id for the current period: "2026-06" (monthly) or "2026-06-01" (daily). */
export function periodBucket(periodType: string, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  if (periodType === "daily") {
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return `${y}-${m}`;
}

/** TTL (seconds) so a counter outlives its period then self-cleans. */
export function periodTtlSec(periodType: string): number {
  return periodType === "daily" ? 3 * 86_400 : 45 * 86_400;
}
