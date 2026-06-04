import { getSummary, getByModel, getByTeam, getTimeseries, getRecent, getBudgetStatus, orgName } from "../lib/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const usd = (v: number): string => {
  if (!v) return "$0";
  if (v < 0.01) return "$" + v.toFixed(6);
  if (v < 1) return "$" + v.toFixed(4);
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const num = (v: number): string => v.toLocaleString();

const WINDOWS = [7, 30, 90];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.days ?? 30)));

  let summary, byModel, byTeam, timeseries, recent, budgets, org, error: string | null = null;
  try {
    [summary, byModel, byTeam, timeseries, recent, budgets, org] = await Promise.all([
      getSummary(days),
      getByModel(days),
      getByTeam(days),
      getTimeseries(days),
      getRecent(25),
      getBudgetStatus(),
      orgName(),
    ]);
  } catch (err) {
    error = String(err);
  }

  if (error || !summary) {
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

  const maxDayCost = Math.max(1e-9, ...timeseries!.map((d) => d.costUsd));

  return (
    <main className="wrap">
      <header className="head">
        <div>
          <h1>{org}</h1>
          <span className="muted">AI FinOps Gateway · LLM spend &amp; governance</span>
        </div>
        <nav className="windows">
          {WINDOWS.map((w) => (
            <a key={w} href={`/?days=${w}`} className={w === days ? "win active" : "win"}>
              {w}d
            </a>
          ))}
        </nav>
      </header>

      <section className="kpis">
        <div className="card kpi">
          <span className="label">Total spend</span>
          <span className="value">{usd(summary.costUsd)}</span>
          <span className="muted">{num(summary.requests)} requests</span>
        </div>
        <div className="card kpi">
          <span className="label">Caching saved</span>
          <span className="value good">{usd(summary.cacheSavingsUsd)}</span>
          <span className="muted">{num(summary.cachedTokens)} cached tokens</span>
        </div>
        <div className="card kpi">
          <span className="label">Tokens</span>
          <span className="value">{num(summary.inputTokens + summary.outputTokens)}</span>
          <span className="muted">{num(summary.inputTokens)} in · {num(summary.outputTokens)} out</span>
        </div>
        <div className="card kpi">
          <span className="label">Blocked</span>
          <span className={summary.blocked ? "value warn" : "value"}>{num(summary.blocked)}</span>
          <span className="muted">policy / budget rejects</span>
        </div>
      </section>

      <section className="card">
        <h2>Spend over time</h2>
        {timeseries!.length === 0 ? (
          <p className="muted">No requests in this window.</p>
        ) : (
          <div className="chart">
            {timeseries!.map((d) => (
              <div key={d.day} className="bar-col" title={`${d.day}: ${usd(d.costUsd)} · ${num(d.requests)} req`}>
                <div className="bar" style={{ height: `${Math.max(2, (d.costUsd / maxDayCost) * 100)}%` }} />
                <span className="bar-label">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Budgets</h2>
        {budgets!.length === 0 ? (
          <p className="muted">No budgets configured. Set one to enforce spend caps.</p>
        ) : (
          <div className="budgets">
            {budgets!.map((b, i) => {
              const level = b.pct >= 100 ? "over" : b.pct >= 80 ? "near" : "ok";
              return (
                <div key={i} className="budget">
                  <div className="budget-head">
                    <span>
                      <b>{b.name}</b> <span className="muted">· {b.scope} · {b.periodType} · {b.action}</span>
                    </span>
                    <span className={`bpct ${level}`}>{b.pct.toFixed(0)}%</span>
                  </div>
                  <div className="meter"><div className={`meter-fill ${level}`} style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
                  <span className="muted">{usd(b.spentUsd)} of {usd(b.limitUsd)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="cols">
        <section className="card">
          <h2>Spend by model</h2>
          <table>
            <thead>
              <tr><th>Provider</th><th>Model</th><th className="r">Requests</th><th className="r">Cost</th></tr>
            </thead>
            <tbody>
              {byModel!.map((m) => (
                <tr key={`${m.provider}:${m.model}`}>
                  <td>{m.provider}</td><td>{m.model}</td>
                  <td className="r">{num(m.requests)}</td><td className="r">{usd(m.costUsd)}</td>
                </tr>
              ))}
              {byModel!.length === 0 && <tr><td colSpan={4} className="muted">No data.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Spend by team</h2>
          <table>
            <thead>
              <tr><th>Team</th><th className="r">Requests</th><th className="r">Cost</th></tr>
            </thead>
            <tbody>
              {byTeam!.map((t) => (
                <tr key={t.teamId ?? "none"}>
                  <td>{t.teamName}</td>
                  <td className="r">{num(t.requests)}</td><td className="r">{usd(t.costUsd)}</td>
                </tr>
              ))}
              {byTeam!.length === 0 && <tr><td colSpan={3} className="muted">No data.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <h2>Recent requests</h2>
        <table>
          <thead>
            <tr><th>Time (UTC)</th><th>Team</th><th>Model</th><th>Status</th><th className="r">Tokens</th><th className="r">Cost</th></tr>
          </thead>
          <tbody>
            {recent!.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.ts.replace("T", " ").slice(0, 19)}</td>
                <td>{r.teamName}</td>
                <td>{r.model}</td>
                <td><span className={`pill pill-${r.status}`}>{r.status}</span></td>
                <td className="r">{num(r.inputTokens + r.outputTokens)}</td>
                <td className="r">{usd(r.costUsd)}</td>
              </tr>
            ))}
            {recent!.length === 0 && <tr><td colSpan={6} className="muted">No requests yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <footer className="muted foot">
        Window: last {days} days · metadata only — no prompts or completions are stored.
      </footer>
    </main>
  );
}
