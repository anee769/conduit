import pino from "pino";
import { loadModelPricing, type ModelPricing } from "@finops/db";
import type { NormalizedUsage } from "./usage";

/**
 * In-memory price book. Loaded from Postgres at boot and refreshed on an
 * interval so cost calc never touches the DB on the hot path.
 */

const logger = pino({ name: "pricing" });

let priceMap = new Map<string, ModelPricing>();

const keyOf = (provider: string, model: string) => `${provider}:${model}`;

export async function loadPricing(): Promise<void> {
  const rows = await loadModelPricing();
  const next = new Map<string, ModelPricing>();
  for (const r of rows) next.set(keyOf(r.provider, r.model), r);
  priceMap = next;
  logger.info({ models: next.size }, "pricing loaded");
}

/** Refresh on an interval; unref so it never holds the process open. */
export function startPricingRefresh(everyMs = 5 * 60_000): void {
  const t = setInterval(() => {
    loadPricing().catch((err) => logger.warn({ err: String(err) }, "pricing refresh failed"));
  }, everyMs);
  t.unref?.();
}

/**
 * Resolve a price row for a model. Exact match first; then a coarse family
 * fallback (so "claude-sonnet-4-5-20260514" still prices off the sonnet row).
 * Returns null when nothing matches — the caller records cost 0 and the missing
 * model surfaces in logs so an admin can add a row.
 */
function resolve(provider: string, model: string): ModelPricing | null {
  const exact = priceMap.get(keyOf(provider, model));
  if (exact) return exact;
  const lower = model.toLowerCase();
  for (const row of priceMap.values()) {
    if (row.provider !== provider) continue;
    const fam = row.model.toLowerCase();
    if (lower.includes(fam) || fam.includes(lower)) return row;
  }
  // Last resort: anthropic family keywords.
  if (provider === "anthropic") {
    const fam = lower.includes("opus") ? "claude-opus-4" : lower.includes("haiku") ? "claude-haiku-4" : lower.includes("sonnet") ? "claude-sonnet-4" : null;
    if (fam) return priceMap.get(keyOf("anthropic", fam)) ?? null;
  }
  return null;
}

const PER_MTOK = 1_000_000;

/** Compute USD cost for a normalized usage record. Returns 0 if unpriced. */
export function costFor(provider: string, model: string, u: NormalizedUsage): number {
  const p = resolve(provider, model);
  if (!p) {
    logger.warn({ provider, model }, "no pricing row — cost recorded as 0");
    return 0;
  }
  const cacheRead = p.cacheReadPerMtokUsd ?? p.inputPerMtokUsd;
  const cacheWrite = p.cacheWritePerMtokUsd ?? p.inputPerMtokUsd;
  return (
    (u.inputTokens * p.inputPerMtokUsd +
      u.outputTokens * p.outputPerMtokUsd +
      u.cacheReadTokens * cacheRead +
      u.cacheCreationTokens * cacheWrite) /
    PER_MTOK
  );
}
