import { getSummary, getByModel, getByTeam, getByKey, getTimeseries, getRecent, getBudgetStatus, getGovernance, getContextRot, orgName } from "../lib/usage";
import DashboardView from "./DashboardView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.days ?? 30)));

  let data;
  let error: string | null = null;
  try {
    const [summary, byModel, byTeam, byKey, timeseries, recent, budgets, governance, contextRot, org] = await Promise.all([
      getSummary(days),
      getByModel(days),
      getByTeam(days),
      getByKey(days),
      getTimeseries(days),
      getRecent(25),
      getBudgetStatus(),
      getGovernance(days),
      getContextRot(days),
      orgName(),
    ]);
    data = { org, days, summary, byModel, byTeam, byKey, timeseries, recent, budgets, governance, contextRot };
  } catch (err) {
    error = String(err);
  }

  if (error || !data) {
    return (
      <main className="wrap">
        <h1>AI FinOps Gateway</h1>
        <div className="card error">
          <b>Analytics backend unavailable.</b>
          <p>{error ?? "No data yet."}</p>
          <p className="muted">Is ClickHouse up and has the gateway recorded any requests?</p>
        </div>
      </main>
    );
  }

  return <DashboardView {...data} />;
}
