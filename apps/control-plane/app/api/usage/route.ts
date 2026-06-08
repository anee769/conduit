import { NextResponse } from "next/server";
import { getSummary, getByModel, getByTeam, getByKey, getTimeseries, getRecent, getBudgetStatus, getGovernance } from "../../../lib/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Consolidated usage analytics for the dashboard and external/programmatic use.
 *   GET /api/usage?days=30
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
  try {
    const [summary, byModel, byTeam, byKey, timeseries, recent, budgets, governance] = await Promise.all([
      getSummary(days),
      getByModel(days),
      getByTeam(days),
      getByKey(days),
      getTimeseries(days),
      getRecent(25),
      getBudgetStatus(),
      getGovernance(days),
    ]);
    return NextResponse.json({ days, summary, byModel, byTeam, byKey, timeseries, recent, budgets, governance });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
