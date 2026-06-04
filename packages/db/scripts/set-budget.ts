/**
 * Create a spend budget (stands in for the M4 wizard's budget UI).
 *
 *   pnpm --filter @finops/db exec tsx scripts/set-budget.ts \
 *     --org <orgId> [--team <teamId>] --limit 5 [--period monthly|daily] [--action block|alert] [--name "..."]
 *
 * Example (block the demo org at 1/100th of a cent to prove enforcement):
 *   ... --org <orgId> --limit 0.0001 --period monthly --action block
 */
import { createBudget, sql } from "../src/index";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const orgId = arg("--org");
const limit = Number(arg("--limit"));
if (!orgId || !Number.isFinite(limit)) {
  console.error("required: --org <uuid> --limit <usd>");
  process.exit(1);
}

try {
  const id = await createBudget({
    orgId,
    teamId: arg("--team") ?? null,
    name: arg("--name") ?? "Budget",
    periodType: (arg("--period") as "daily" | "monthly") ?? "monthly",
    limitUsd: limit,
    action: (arg("--action") as "alert" | "block") ?? "block",
  });
  console.log(JSON.stringify({ budgetId: id, orgId, limitUsd: limit }, null, 2));
} finally {
  await sql.end();
}
