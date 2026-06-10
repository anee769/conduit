"use client";

import { useState } from "react";
import type {
  Summary,
  ModelRow,
  TeamRow,
  KeyRow,
  DayRow,
  RecentRow,
  BudgetStatus,
  Governance,
} from "../lib/usage";

const usd = (v: number): string => {
  if (!v) return "$0";
  if (v < 0.01) return "$" + v.toFixed(6);
  if (v < 1) return "$" + v.toFixed(4);
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const num = (v: number): string => v.toLocaleString();

const WINDOWS = [7, 30, 90];
const TABS = ["Overview", "Spend", "Governance", "Budgets", "Activity"] as const;
type Tab = (typeof TABS)[number];

export type DashboardData = {
  org: string;
  days: number;
  summary: Summary;
  byModel: ModelRow[];
  byTeam: TeamRow[];
  byKey: KeyRow[];
  timeseries: DayRow[];
  recent: RecentRow[];
  budgets: BudgetStatus[];
  governance: Governance;
};

export default function DashboardView(props: DashboardData) {
  const { org, days, summary, byModel, byTeam, byKey, timeseries, recent, budgets, governance } = props;
  const [tab, setTab] = useState<Tab>("Overview");
  const maxDayCost = Math.max(1e-9, ...timeseries.map((d) => d.costUsd));

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">
          <div className="logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
              <path d="M12 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Conduit</div>
            <div className="brand-sub">{org} · AI gateway — spend &amp; governance</div>
          </div>
        </div>
        <nav className="windows">
          {WINDOWS.map((w) => (
            <a key={w} href={`/?days=${w}`} className={w === days ? "win active" : "win"}>
              {w}d
            </a>
          ))}
        </nav>
      </header>

      <nav className="tabs">
        {TABS.map((t) => {
          const badge =
            t === "Governance" && summary.governanceFlagged > 0
              ? summary.governanceFlagged
              : t === "Budgets" && budgets.some((b) => b.pct >= 100)
                ? budgets.filter((b) => b.pct >= 100).length
                : null;
          return (
            <button
              key={t}
              className={t === tab ? "tab active" : "tab"}
              onClick={() => setTab(t)}
            >
              {t}
              {badge != null && <span className="tab-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      <main className="tabpanel">
        {tab === "Overview" && (
          <Overview summary={summary} timeseries={timeseries} maxDayCost={maxDayCost} days={days} />
        )}
        {tab === "Spend" && <Spend byModel={byModel} byTeam={byTeam} byKey={byKey} />}
        {tab === "Governance" && <GovernanceTab governance={governance} requests={summary.requests} />}
        {tab === "Budgets" && <Budgets budgets={budgets} />}
        {tab === "Activity" && <Activity recent={recent} days={days} />}
      </main>

      <footer className="muted foot">
        Window: last {days} days · metadata only — no prompts or completions are stored.
      </footer>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  spark,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn";
  spark?: number[];
}) {
  return (
    <div className="card kpi">
      <span className="label">{label}</span>
      <span className={tone ? `value ${tone}` : "value"}>{value}</span>
      <span className="muted">{sub}</span>
      {spark && spark.length > 1 && <Sparkline points={spark} />}
    </div>
  );
}

/** Tiny inline trend line for a KPI card (pure SVG, no deps). */
function Sparkline({ points }: { points: number[] }) {
  const w = 110;
  const h = 26;
  const max = Math.max(1e-9, ...points);
  const step = w / (points.length - 1);
  const xy = points.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`);
  const last = xy[xy.length - 1]!.split(",");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={xy.join(" ")} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill="var(--accent)" />
    </svg>
  );
}

/** Compact dollar label for chart annotations. */
const usdShort = (v: number): string => {
  if (v >= 100) return "$" + Math.round(v).toLocaleString();
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(2);
  return v > 0 ? "<$0.01" : "$0";
};

function Overview({
  summary,
  timeseries,
  maxDayCost,
  days,
}: {
  summary: Summary;
  timeseries: DayRow[];
  maxDayCost: number;
  days: number;
}) {
  return (
    <>
      <section className="kpis">
        <Kpi
          label="Total spend"
          value={usd(summary.costUsd)}
          sub={`${num(summary.requests)} req · ${usdShort(summary.costUsd / Math.max(1, timeseries.length))}/day`}
          spark={timeseries.map((d) => d.costUsd)}
        />
        <Kpi label="Caching saved" value={usd(summary.cacheSavingsUsd)} sub={`${num(summary.cachedTokens)} cached tokens`} tone="good" />
        <Kpi label="Tokens" value={num(summary.inputTokens + summary.outputTokens)} sub={`${num(summary.inputTokens)} in · ${num(summary.outputTokens)} out`} />
        <Kpi label="Blocked" value={num(summary.blocked)} sub="policy / budget rejects" tone={summary.blocked ? "warn" : undefined} />
        <Kpi label="Governance flags" value={num(summary.governanceFlagged)} sub="requests with sensitive data" tone={summary.governanceFlagged ? "warn" : "good"} />
      </section>

      <section className="card">
        <h2>Spend over time</h2>
        {timeseries.length === 0 ? (
          <p className="muted">No requests in the last {days} days.</p>
        ) : (
          <div className="chartbox">
            <div className="ylabels" aria-hidden>
              <span>{usdShort(maxDayCost)}</span>
              <span>{usdShort(maxDayCost / 2)}</span>
              <span>$0</span>
            </div>
            <div className="chart">
              {timeseries.map((d) => (
                <div key={d.day} className="bar-col" title={`${d.day}: ${usd(d.costUsd)} · ${num(d.requests)} req`}>
                  {timeseries.length <= 20 && <span className="bar-val">{usdShort(d.costUsd)}</span>}
                  {/* height scales against the PLOT area (column minus the two label rows),
                      so a max-value bar tops out exactly at the max gridline */}
                  <div
                    className="bar"
                    style={{ height: `max(3px, calc((100% - 2.75rem) * ${(d.costUsd / maxDayCost).toFixed(4)}))` }}
                  />
                  <span className="bar-label">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/** Share-of-total bar rendered inline in spend tables. */
function Share({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <td className="sharecell">
      <div className="sharebar"><i style={{ width: `${Math.max(2, pct)}%` }} /></div>
      <span className="sharepct">{pct.toFixed(0)}%</span>
    </td>
  );
}

function Spend({ byModel, byTeam, byKey }: { byModel: ModelRow[]; byTeam: TeamRow[]; byKey: KeyRow[] }) {
  const modelTotal = byModel.reduce((s, m) => s + m.costUsd, 0);
  const keyTotal = byKey.reduce((s, k) => s + k.costUsd, 0);
  return (
    <>
      <div className="cols">
        <section className="card">
          <h2>Spend by model</h2>
          <table>
            <thead>
              <tr><th>Provider</th><th>Model</th><th className="r">Requests</th><th className="r">Cost</th><th>Share</th></tr>
            </thead>
            <tbody>
              {byModel.map((m) => (
                <tr key={`${m.provider}:${m.model}`}>
                  <td>{m.provider}</td><td>{m.model}</td>
                  <td className="r">{num(m.requests)}</td><td className="r">{usd(m.costUsd)}</td>
                  <Share value={m.costUsd} total={modelTotal} />
                </tr>
              ))}
              {byModel.length === 0 && <tr><td colSpan={5} className="muted">No data.</td></tr>}
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
              {byTeam.map((t) => (
                <tr key={t.teamId ?? "none"}>
                  <td>{t.teamName}</td>
                  <td className="r">{num(t.requests)}</td><td className="r">{usd(t.costUsd)}</td>
                </tr>
              ))}
              {byTeam.length === 0 && <tr><td colSpan={3} className="muted">No data.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Spend by virtual key <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}>· per-engineer / per-service attribution</span></h2>
        <p className="muted" style={{ marginTop: -4 }}>
          The breakdown a shared provider key can&apos;t give you: exactly which key
          drove the spend.
        </p>
        <table>
          <thead>
            <tr><th>Virtual key</th><th>Prefix</th><th>Team</th><th className="r">Requests</th><th className="r">Cost</th><th>Share</th></tr>
          </thead>
          <tbody>
            {byKey.map((k) => (
              <tr key={k.keyId ?? "none"}>
                <td>{k.keyName}</td>
                <td className="mono">{k.keyPrefix ?? "—"}</td>
                <td>{k.teamName}</td>
                <td className="r">{num(k.requests)}</td>
                <td className="r">{usd(k.costUsd)}</td>
                <Share value={k.costUsd} total={keyTotal} />
              </tr>
            ))}
            {byKey.length === 0 && <tr><td colSpan={6} className="muted">No data.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}

function GovernanceTab({ governance, requests }: { governance: Governance; requests: number }) {
  const pctOfTraffic = requests > 0 ? (governance.totalFlagged / requests) * 100 : 0;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Data governance</h2>
        <span className={`pill pill-${governance.mode === "block" ? "blocked" : "cache_hit"}`}>
          global mode: {governance.mode}
        </span>
      </div>
      {governance.totalFlagged > 0 && (
        <p className="gov-stat">
          <b>{num(governance.totalFlagged)}</b> flagged requests · <b>{pctOfTraffic.toFixed(1)}%</b> of traffic ·{" "}
          <b>{governance.byCategory.length}</b> {governance.byCategory.length === 1 ? "category" : "categories"} — caught{" "}
          <b>before</b> leaving the perimeter
        </p>
      )}
      <p className="muted" style={{ marginTop: -4 }}>
        Requests where sensitive data (secrets, keys, credentials) was detected before
        leaving for the provider. Categories only — the matched value is never stored.
        Each category is either <b>blocking</b> (rejected with 451) or <b>alerting</b>{" "}
        (forwarded + recorded). Watch the alerting categories, then promote the
        high-confidence ones to block via <code>GOVERNANCE_BLOCK_CATEGORIES</code>.
      </p>
      {governance.totalFlagged === 0 ? (
        <p className="muted">No sensitive data detected in this window. ✅</p>
      ) : (
        <>
          <div className="chips">
            {governance.byCategory.map((cf) => (
              <span key={cf.category} className={`chip chip-${cf.enforced}`} title={cf.enforced === "block" ? "blocking (451)" : "alerting — forwarded & recorded"}>
                {cf.category.replace(/_/g, " ")}
                <span className="chip-count">{num(cf.requests)}</span>
                <span className="chip-mode">{cf.enforced === "block" ? "⛔ block" : "⚠ alert"}</span>
              </span>
            ))}
          </div>
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr><th>Time (UTC)</th><th>Team</th><th>Model</th><th>Categories</th><th>Status</th></tr>
            </thead>
            <tbody>
              {governance.recent.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.ts.replace("T", " ").slice(0, 19)}</td>
                  <td>{r.teamName}</td>
                  <td>{r.model}</td>
                  <td>{r.categories.map((c) => c.replace(/_/g, " ")).join(", ")}</td>
                  <td>
                    <span className={`pill pill-${r.httpStatus === 451 ? "blocked" : "cache_hit"}`}>
                      {r.httpStatus === 451 ? "blocked" : "alerted"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Budgets({ budgets }: { budgets: BudgetStatus[] }) {
  return (
    <section className="card">
      <h2>Budgets</h2>
      {budgets.length === 0 ? (
        <p className="muted">No budgets configured. Set one to enforce spend caps.</p>
      ) : (
        <div className="budgets">
          {budgets.map((b, i) => {
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
  );
}

function Activity({ recent, days }: { recent: RecentRow[]; days: number }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Recent requests</h2>
        <div className="actions">
          <a className="btn-sm" href={`/api/audit?days=${days}&format=csv`}>Export CSV</a>
          <a className="btn-sm" href={`/api/audit?days=${days}&format=json`}>Export JSON</a>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        Auditor-ready export of every request in this window — metadata only
        (who / when / model / status / tokens / cost / governance), never prompts
        or completions.
      </p>
      <table>
        <thead>
          <tr><th>Time (UTC)</th><th>Team</th><th>Model</th><th>Status</th><th className="r">Tokens</th><th className="r">Cost</th></tr>
        </thead>
        <tbody>
          {recent.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.ts.replace("T", " ").slice(0, 19)}</td>
              <td>{r.teamName}</td>
              <td>{r.model}</td>
              <td><span className={`pill pill-${r.status}`}>{r.status}</span></td>
              <td className="r">{num(r.inputTokens + r.outputTokens)}</td>
              <td className="r">{usd(r.costUsd)}</td>
            </tr>
          ))}
          {recent.length === 0 && <tr><td colSpan={6} className="muted">No requests yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
