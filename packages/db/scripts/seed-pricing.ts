/**
 * Seed (or refresh) the model_pricing table with shipped defaults.
 *
 *   pnpm --filter @finops/db seed-pricing
 *
 * Idempotent: re-running upserts each row, so it doubles as a "reset prices to
 * defaults" command. Admins can edit individual rows afterwards.
 */
import { DEFAULT_PRICING, upsertModelPricing, sql } from "../src/index";

try {
  for (const row of DEFAULT_PRICING) {
    await upsertModelPricing(row);
  }
  // eslint-disable-next-line no-console
  console.log(`seeded ${DEFAULT_PRICING.length} model_pricing rows`);
} finally {
  await sql.end();
}
