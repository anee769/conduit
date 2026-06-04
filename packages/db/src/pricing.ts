import { eq } from "drizzle-orm";
import { db } from "./client";
import { modelPricing, type ModelPricing } from "./schema";

/**
 * Per-model price book. Prices are USD per MILLION tokens.
 *
 * The gateway loads this into memory at boot (and refreshes periodically) to
 * compute request cost without a DB round-trip on the hot path. Values here are
 * shipped defaults for 2026 list prices — admins override per deployment, and
 * on-prem customers with negotiated/committed-use rates edit the table directly.
 */

export type PriceRow = {
  provider: string;
  model: string;
  inputPerMtokUsd: number;
  outputPerMtokUsd: number;
  cacheReadPerMtokUsd: number | null;
  cacheWritePerMtokUsd: number | null;
};

// Shipped defaults. NOT authoritative billing data — a starting point only.
export const DEFAULT_PRICING: PriceRow[] = [
  // ── Anthropic ────────────────────────────────────────────────────────────
  { provider: "anthropic", model: "claude-opus-4",   inputPerMtokUsd: 15, outputPerMtokUsd: 75, cacheReadPerMtokUsd: 1.5,  cacheWritePerMtokUsd: 18.75 },
  { provider: "anthropic", model: "claude-sonnet-4", inputPerMtokUsd: 3,  outputPerMtokUsd: 15, cacheReadPerMtokUsd: 0.3,  cacheWritePerMtokUsd: 3.75 },
  { provider: "anthropic", model: "claude-haiku-4",  inputPerMtokUsd: 0.8, outputPerMtokUsd: 4, cacheReadPerMtokUsd: 0.08, cacheWritePerMtokUsd: 1 },
  // ── OpenAI ───────────────────────────────────────────────────────────────
  { provider: "openai", model: "gpt-4o",      inputPerMtokUsd: 2.5,  outputPerMtokUsd: 10,  cacheReadPerMtokUsd: 1.25, cacheWritePerMtokUsd: null },
  { provider: "openai", model: "gpt-4o-mini", inputPerMtokUsd: 0.15, outputPerMtokUsd: 0.6, cacheReadPerMtokUsd: 0.075, cacheWritePerMtokUsd: null },
  { provider: "openai", model: "gpt-4.1",     inputPerMtokUsd: 2,    outputPerMtokUsd: 8,   cacheReadPerMtokUsd: 0.5,  cacheWritePerMtokUsd: null },
  { provider: "openai", model: "o3-mini",     inputPerMtokUsd: 1.1,  outputPerMtokUsd: 4.4, cacheReadPerMtokUsd: 0.55, cacheWritePerMtokUsd: null },
];

/** Idempotently upsert one price row (keyed by provider+model). */
export async function upsertModelPricing(row: PriceRow): Promise<void> {
  await db
    .insert(modelPricing)
    .values(row)
    .onConflictDoUpdate({
      target: [modelPricing.provider, modelPricing.model],
      set: {
        inputPerMtokUsd: row.inputPerMtokUsd,
        outputPerMtokUsd: row.outputPerMtokUsd,
        cacheReadPerMtokUsd: row.cacheReadPerMtokUsd,
        cacheWritePerMtokUsd: row.cacheWritePerMtokUsd,
        updatedAt: new Date(),
      },
    });
}

/** Load the whole price book (the gateway caches this in memory). */
export async function loadModelPricing(): Promise<ModelPricing[]> {
  return db.select().from(modelPricing);
}

/** List one provider's rows (admin/debug). */
export async function listModelPricingFor(provider: string): Promise<ModelPricing[]> {
  return db.select().from(modelPricing).where(eq(modelPricing.provider, provider));
}
