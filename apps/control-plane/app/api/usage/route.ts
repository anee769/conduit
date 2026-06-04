import { NextResponse } from "next/server";
import { getSummary, getByModel, getByTeam, getTimeseries, getRecent, getBudgetStatus } from "../../../lib/usage";

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
    const [summary, byModel, byTeam, timeseries, recent, budgets] = await Promise.all([
      getSummary(days),
      getByModel(days),
      getByTeam(days),
      getTimeseries(days),
      getRecent(25),
      getBudgetStatus(),
    ]);
    return NextResponse.json({ days, summary, byModel, byTeam, timeseries, recent, budgets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
