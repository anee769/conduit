"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import ThemeToggle from "./ThemeToggle";
import type {
  Summary,
  ModelRow,
  TeamRow,
  KeyRow,
  DayRow,
  RecentRow,
  BudgetStatus,
  Governance,
  ContextRotBucket,
} from "../lib/usage";

const usd = (v: number): string => {
  if (!v) return "$0";
  if (v < 0.01) return "$" + v.toFixed(6);
  if (v < 1) return "$" + v.toFixed(4);
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const num = (v: number): string => v.toLocaleString();
/** Rounds before formatting — use as the animated `format` prop for integer counts. */
const numInt = (v: number): string => Math.round(v).toLocaleString();

const WINDOWS = [7, 30, 90];
const TABS = ["Overview", "Spend", "Context", "Governance", "Budgets", "Activity", "Settings"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, ReactElement> = {
  Overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  Spend: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5.5A4 4 0 0 0 13 3H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8h-4a4 4 0 0 1-4-2.5" />
    </svg>
  ),
  Context: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  ),
  Governance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6z" />
    </svg>
  ),
  Budgets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20M7 15h3" />
    </svg>
  ),
  Activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  ),
  Settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

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
  contextRot: ContextRotBucket[];
};

export default function DashboardView(props: DashboardData) {
  const { org, days, summary, byModel, byTeam, byKey, timeseries, recent, budgets, governance, contextRot } = props;
  const [tab, setTab] = useState<Tab>("Overview");
  const maxDayCost = Math.max(1e-9, ...timeseries.map((d) => d.costUsd));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
              <path d="M12 5l6 7-6 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="sidebar-brand-name">Conduit</div>
            <div className="sidebar-brand-sub">{org}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
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
                className={t === tab ? "sidebar-link active" : "sidebar-link"}
                onClick={() => setTab(t)}
              >
                {TAB_ICONS[t]}
                {t}
                {badge != null && <span className="sidebar-badge">{badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-sep" />
        <div className="sidebar-foot">
          <a href="/security" className="sidebar-link" title="Security posture">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4" /><path d="M12 2 4 6v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6z" />
            </svg>
            Security
          </a>
          <div style={{ padding: "0.3rem 0.65rem" }}>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div>
            <h1>{tab}</h1>
            <p className="muted">control plane for AI coding agents — spend · governance · context</p>
          </div>
          <div className="topbar-actions">
            <span className="live-dot" title="Live data — auto-refreshes on navigation" />
            <div className="window-switch">
              {WINDOWS.map((w) => (
                <a key={w} href={`/?days=${w}`} className={w === days ? "window-opt active" : "window-opt"}>
                  {w}d
                </a>
              ))}
            </div>
          </div>
        </header>

        <main className="tabpanel">
          {tab === "Overview" && (
            <Overview summary={summary} timeseries={timeseries} maxDayCost={maxDayCost} days={days} />
          )}
          {tab === "Spend" && <Spend byModel={byModel} byTeam={byTeam} byKey={byKey} />}
          {tab === "Context" && <ContextRotTab contextRot={contextRot} />}
          {tab === "Governance" && <GovernanceTab governance={governance} requests={summary.requests} />}
          {tab === "Budgets" && <Budgets budgets={budgets} />}
          {tab === "Activity" && <Activity recent={recent} days={days} />}
          {tab === "Settings" && <Settings />}
        </main>

        <footer className="muted foot">
          Window: last {days} days · metadata only — no prompts or completions are stored.
        </footer>
      </div>
    </div>
  );
}

/** Animates a number from 0 to `target` over `ms`, easing out. Re-runs whenever `target` changes. */
function useCountUp(target: number, ms = 700): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setN(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function Kpi({
  label,
  value,
  sub,
  tone,
  spark,
  raw,
  format,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn";
  spark?: number[];
  /** When provided (with `format`), the value animates from 0 → raw on mount/update. */
  raw?: number;
  format?: (n: number) => string;
}) {
  const animated = useCountUp(raw ?? 0);
  const display = raw != null && format ? format(animated) : value;
  return (
    <div className="card kpi">
      <span className="label">{label}</span>
      <span className={tone ? `value ${tone}` : "value"}>{display}</span>
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
          raw={summary.costUsd}
          format={usd}
          sub={`${num(summary.requests)} req · ${usdShort(summary.costUsd / Math.max(1, timeseries.length))}/day`}
          spark={timeseries.map((d) => d.costUsd)}
        />
        <Kpi
          label="Caching saved"
          value={usd(summary.cacheSavingsUsd)}
          raw={summary.cacheSavingsUsd}
          format={usd}
          sub={`${num(summary.cachedTokens)} cache reads`}
          tone="good"
        />
        <Kpi
          label="Tokens"
          value={num(summary.inputTokens + summary.outputTokens + summary.cachedTokens + summary.cacheCreationTokens)}
          raw={summary.inputTokens + summary.outputTokens + summary.cachedTokens + summary.cacheCreationTokens}
          format={numInt}
          sub={`${num(summary.inputTokens)} in · ${num(summary.outputTokens)} out · ${num(summary.cachedTokens)} cache-read · ${num(summary.cacheCreationTokens)} cache-write`}
        />
        <Kpi label="Blocked" value={num(summary.blocked)} raw={summary.blocked} format={numInt} sub="policy / budget rejects" tone={summary.blocked ? "warn" : undefined} />
        <Kpi label="Governance flags" value={num(summary.governanceFlagged)} raw={summary.governanceFlagged} format={numInt} sub="requests with sensitive data" tone={summary.governanceFlagged ? "warn" : "good"} />
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

function ContextRotTab({ contextRot }: { contextRot: ContextRotBucket[] }) {
  const totalReq = contextRot.reduce((s, b) => s + b.requests, 0);
  const hasData = totalReq > 0;
  // For the cost-curve bar, scale against the bucket with the highest avg cost.
  const maxAvgCost = Math.max(1e-9, ...contextRot.map((b) => b.avgCostUsd));
  // Identify the "rot zone": buckets ≥32K with elevated error rate vs the smallest bucket.
  const small = contextRot[0]?.errorRate ?? 0;
  const rotBuckets = contextRot.filter((b) => b.minTokens >= 32000 && b.requests > 0 && b.errorRate > small + 0.02);
  const rotShare = rotBuckets.reduce((s, b) => s + b.requests, 0) / Math.max(1, totalReq);
  const rotCost = rotBuckets.reduce((s, b) => s + b.avgCostUsd * b.requests, 0);
  return (
    <>
      <section className="card">
        <h2>Context rot — cost &amp; error rate by conversation size</h2>
        <p className="muted small">
          Bucketed by input tokens (the prompt size Claude / GPT receives). We
          never modify the prompt — this is observation only. The signal is the
          <i> shape</i> of the curve: avg cost climbs linearly with size, but
          error / retry rate climbs faster past the rot boundary. That gap is
          what your team is paying for context rot.
        </p>
        {!hasData ? (
          <p className="muted">No traffic in the selected window.</p>
        ) : (
          <table className="ctxrot">
            <thead>
              <tr>
                <th>Bucket</th>
                <th className="r">Requests</th>
                <th className="r">Avg input tokens</th>
                <th className="r">Avg cost</th>
                <th className="r">Avg latency</th>
                <th className="r">Error rate</th>
                <th>Cost curve</th>
              </tr>
            </thead>
            <tbody>
              {contextRot.map((b) => {
                const w = b.avgCostUsd > 0 ? (b.avgCostUsd / maxAvgCost) * 100 : 0;
                const errHot = b.requests > 0 && b.errorRate > small + 0.02;
                return (
                  <tr key={b.label}>
                    <td><code>{b.label}</code></td>
                    <td className="r">{num(b.requests)}</td>
                    <td className="r">{num(b.avgInputTokens)}</td>
                    <td className="r">{usd(b.avgCostUsd)}</td>
                    <td className="r">{b.avgLatencyMs ? `${num(b.avgLatencyMs)} ms` : "—"}</td>
                    <td className={`r ${errHot ? "warn" : ""}`}>
                      {b.requests > 0 ? `${(b.errorRate * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="sharecell">
                      <div className="sharebar"><i style={{ width: `${Math.max(2, w)}%` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {hasData && rotShare > 0 && (
        <section className="card">
          <h2>Where you&apos;re paying for rot</h2>
          <p>
            <b>{(rotShare * 100).toFixed(1)}%</b> of requests fall in the rot zone
            (≥32K tokens, elevated error rate vs the &lt;8K baseline). Those
            requests cost an estimated <b>{usd(rotCost)}</b> in the selected
            window.
          </p>
          <p className="muted small">
            Mitigations live in the client / agent (Anthropic prompt caching,
            conversation compaction, task-aware context trimming) — not in the
            gateway. Conduit surfaces the bill so the right team can act.
          </p>
        </section>
      )}
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

function Budgets({ budgets: initial }: { budgets: BudgetStatus[] }) {
  const [budgets, setBudgets] = useState<BudgetStatus[]>(initial);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const r = await fetch("/api/admin/budgets/status");
        if (!r.ok || !alive) return;
        const j = await r.json();
        if (Array.isArray(j.budgets)) setBudgets(j.budgets);
      } catch { /* silent — stale data beats a crash */ }
    }
    const t = setInterval(() => void refresh(), 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

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

const STATUS_META: Record<string, { label: string; cls: string }> = {
  success:            { label: "success",            cls: "success" },
  cache_hit:          { label: "cache hit",          cls: "cache_hit" },
  rate_limited:       { label: "rate limited",       cls: "rate_limited" },
  model_blocked:      { label: "model blocked",      cls: "model_blocked" },
  budget_exceeded:    { label: "budget exceeded",    cls: "budget_exceeded" },
  governance_blocked: { label: "governance blocked", cls: "governance_blocked" },
  blocked:            { label: "blocked",            cls: "blocked" },
};

function statusPill(status: string) {
  const m = STATUS_META[status] ?? { label: status, cls: "blocked" };
  return <span className={`pill pill-${m.cls}`}>{m.label}</span>;
}

function Activity({ recent, days }: { recent: RecentRow[]; days: number }) {
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Recent requests</h2>
          <div className="actions">
            <a className="btn-sm" href={`/api/audit?days=${days}&format=csv`}>Export CSV</a>
            <a className="btn-sm" href={`/api/audit?days=${days}&format=json`}>Export JSON</a>
          </div>
        </div>
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
                <td>{statusPill(r.status)}</td>
                <td className="r">{num(r.inputTokens + r.outputTokens + r.cachedTokens + r.cacheCreationTokens)}</td>
                <td className="r">{usd(r.costUsd)}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={6} className="muted">No requests yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginTop: "1.25rem" }}>
        <div className="card-head">
          <h2>Audit log</h2>
          <div className="actions">
            <a className="btn-sm" href={`/api/audit?days=${days}&format=csv`}>Export CSV</a>
            <a className="btn-sm" href={`/api/audit?days=${days}&format=json`}>Export JSON</a>
          </div>
        </div>
        <p className="muted" style={{ marginTop: "0.6rem", marginBottom: "0.75rem" }}>
          Immutable, append-only record of every request — metadata only (who, when, model, status, tokens, cost, governance categories). Prompts and completions are <b>never stored</b>. Use for compliance reviews, security incidents, or cost chargebacks.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[7, 14, 30, 90].map((d) => (
              <a key={d} className="btn-sm" href={`/api/audit?days=${d}&format=csv`}>Last {d}d CSV</a>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
            Fields: <span className="mono">ts · org_id · team_id · vk_id · model · provider · status · http_status · input_tokens · output_tokens · cache_read_tokens · cache_creation_tokens · cost_usd · governance_categories · request_id · duration_ms</span>
          </p>
        </div>
      </section>
    </>
  );
}

// ── Settings tab: org / credentials / teams / virtual keys / budgets ───────
// Reuses the same admin API the /setup wizard uses. Auth is the dashboard
// cookie (already present — you're logged in to see this page), so no admin
// token entry is needed here.

type SettingsCredential = { id: string; provider: string; displayName: string };
type SettingsTeam = { id: string; name: string };
type SettingsKey = { id: string; name: string; keyPrefix: string | null; teamId: string | null; status: string };
type SettingsBudget = { id: string; name: string; teamId: string | null; periodType: string; limitUsd: number; action: string };

async function jsonFetch(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

function Settings() {
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [credentials, setCredentials] = useState<SettingsCredential[]>([]);
  const [teams, setTeams] = useState<SettingsTeam[]>([]);
  const [keys, setKeys] = useState<SettingsKey[]>([]);
  const [budgets, setBudgets] = useState<SettingsBudget[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [orgEdit, setOrgEdit] = useState<string | null>(null); // null = not editing

  const refresh = useCallback(async () => {
    try {
      const status = await jsonFetch("/api/admin/setup-status");
      setOrg(status.org);
      const [c, t, k, b] = await Promise.all([
        jsonFetch("/api/admin/credentials").catch(() => ({ credentials: [] })),
        jsonFetch("/api/admin/teams").catch(() => ({ teams: [] })),
        jsonFetch("/api/admin/keys").catch(() => ({ keys: [] })),
        jsonFetch("/api/admin/budgets").catch(() => ({ budgets: [] })),
      ]);
      setCredentials(c.credentials ?? []);
      setTeams(t.teams ?? []);
      setKeys(k.keys ?? []);
      setBudgets(b.budgets ?? []);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const [credForm, setCredForm] = useState({ provider: "anthropic", apiKey: "", displayName: "" });
  const [teamForm, setTeamForm] = useState("");
  const [keyForm, setKeyForm] = useState({ name: "", teamId: "" });
  const [budgetForm, setBudgetForm] = useState({ name: "", teamId: "", periodType: "monthly", limitUsd: "", action: "block" });

  async function saveOrgName() {
    if (!org || !orgEdit?.trim()) return;
    try {
      await jsonFetch(`/api/admin/orgs/${org.id}`, { method: "PATCH", body: JSON.stringify({ name: orgEdit.trim() }) });
      setOrgEdit(null);
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function addCredential() {
    try {
      await jsonFetch("/api/admin/credentials", {
        method: "POST",
        body: JSON.stringify({
          provider: credForm.provider,
          apiKey: credForm.apiKey,
          displayName: credForm.displayName || credForm.provider,
        }),
      });
      setCredForm({ provider: "anthropic", apiKey: "", displayName: "" });
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function deleteCredential(id: string) {
    if (!confirm("Remove this credential? Keys using it will stop working.")) return;
    try {
      await jsonFetch(`/api/admin/credentials/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function addTeam() {
    try {
      await jsonFetch("/api/admin/teams", { method: "POST", body: JSON.stringify({ name: teamForm }) });
      setTeamForm("");
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function deleteTeam(id: string, name: string) {
    if (!confirm(`Delete team "${name}"? Virtual keys assigned to it will become unassigned.`)) return;
    try {
      await jsonFetch(`/api/admin/teams/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function addKey() {
    try {
      const teamId = keyForm.teamId || teams[0]?.id;
      const res = await jsonFetch("/api/admin/keys", { method: "POST", body: JSON.stringify({ name: keyForm.name, ...(teamId ? { teamId } : {}) }) });
      setCreatedKey(res.virtualKey);
      setKeyForm({ name: "", teamId: "" });
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function revokeKey(id: string) {
    try {
      await jsonFetch(`/api/admin/keys/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function addBudget() {
    try {
      await jsonFetch("/api/admin/budgets", {
        method: "POST",
        body: JSON.stringify({
          name: budgetForm.name,
          teamId: budgetForm.teamId || undefined,
          periodType: budgetForm.periodType,
          limitUsd: Number(budgetForm.limitUsd),
          action: budgetForm.action,
        }),
      });
      setBudgetForm({ name: "", teamId: "", periodType: "monthly", limitUsd: "", action: "block" });
      await refresh();
    } catch (e) { setErr(String(e)); }
  }
  async function deleteBudget(id: string, name: string) {
    if (!confirm(`Delete budget "${name}"?`)) return;
    try {
      await jsonFetch(`/api/admin/budgets/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setErr(String(e)); }
  }

  return (
    <>
      {err && <div className="card error" style={{ cursor: "pointer" }} onClick={() => setErr(null)}>{err} <span className="muted">· click to dismiss</span></div>}

      {/* Organization */}
      <section className="card">
        <h2>Organization</h2>
        {org ? (
          orgEdit !== null ? (
            <div className="row">
              <input className="in" value={orgEdit} onChange={(e) => setOrgEdit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void saveOrgName()} autoFocus />
              <button className="btn" onClick={() => void saveOrgName()} disabled={!orgEdit.trim()}>Save</button>
              <button className="btn-sm" onClick={() => setOrgEdit(null)}>Cancel</button>
            </div>
          ) : (
            <div className="settings-row">
              <b>{org.name}</b>
              <button className="btn-sm" onClick={() => setOrgEdit(org.name)}>Rename</button>
            </div>
          )
        ) : (
          <p className="muted">No organization yet — create one to get started.</p>
        )}
      </section>

      {/* Provider credentials */}
      <section className="card">
        <h2>Provider credentials <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem", textTransform: "none" }}>· {credentials.length}</span></h2>
        {credentials.length > 0 && (
          <table style={{ marginBottom: ".9rem" }}>
            <thead><tr><th>Name</th><th>Provider</th><th></th></tr></thead>
            <tbody>
              {credentials.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.displayName}</b></td>
                  <td className="muted">{c.provider}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-sm btn-danger" onClick={() => void deleteCredential(c.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row">
          <select className="in" value={credForm.provider} onChange={(e) => setCredForm({ ...credForm, provider: e.target.value })}>
            <option value="anthropic">anthropic</option>
            <option value="openai">openai</option>
            <option value="azure">azure</option>
          </select>
          <input className="in" placeholder="Display name (optional)" value={credForm.displayName} onChange={(e) => setCredForm({ ...credForm, displayName: e.target.value })} />
          <input className="in" placeholder="API key (encrypted at rest)" type="password" value={credForm.apiKey} onChange={(e) => setCredForm({ ...credForm, apiKey: e.target.value })} />
          <button className="btn" onClick={() => void addCredential()} disabled={!credForm.apiKey}>Add</button>
        </div>
      </section>

      <div className="cols">
        {/* Teams */}
        <section className="card">
          <h2>Teams <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem", textTransform: "none" }}>· {teams.length}</span></h2>
          {teams.length > 0 && (
            <table style={{ marginBottom: ".9rem" }}>
              <thead><tr><th>Name</th><th></th></tr></thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn-sm btn-danger" onClick={() => void deleteTeam(t.id, t.name)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row">
            <input className="in" placeholder="Team name" value={teamForm} onChange={(e) => setTeamForm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && teamForm && void addTeam()} />
            <button className="btn" onClick={() => void addTeam()} disabled={!teamForm}>Add team</button>
          </div>
        </section>

        {/* Budgets */}
        <section className="card">
          <h2>Budgets <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem", textTransform: "none" }}>· {budgets.length}</span></h2>
          {budgets.length > 0 && (
            <table style={{ marginBottom: ".9rem" }}>
              <thead><tr><th>Name</th><th>Limit</th><th>Scope</th><th>Action</th><th></th></tr></thead>
              <tbody>
                {budgets.map((b) => {
                  const team = teams.find((t) => t.id === b.teamId);
                  return (
                    <tr key={b.id}>
                      <td><b>{b.name}</b></td>
                      <td className="muted">{usd(b.limitUsd)}/{b.periodType}</td>
                      <td className="muted">{team ? team.name : "org-wide"}</td>
                      <td><span className={`pill pill-${b.action === "block" ? "blocked" : "cache_hit"}`}>{b.action}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn-sm btn-danger" onClick={() => void deleteBudget(b.id, b.name)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="row">
            <input className="in" placeholder="Budget name" value={budgetForm.name} onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })} />
            <input className="in" placeholder="Limit USD" type="number" min="0" value={budgetForm.limitUsd} onChange={(e) => setBudgetForm({ ...budgetForm, limitUsd: e.target.value })} />
          </div>
          <div className="row" style={{ marginTop: ".5rem" }}>
            <select className="in" value={budgetForm.teamId} onChange={(e) => setBudgetForm({ ...budgetForm, teamId: e.target.value })}>
              <option value="">Org-wide</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="in" value={budgetForm.periodType} onChange={(e) => setBudgetForm({ ...budgetForm, periodType: e.target.value })}>
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
            </select>
            <select className="in" value={budgetForm.action} onChange={(e) => setBudgetForm({ ...budgetForm, action: e.target.value })}>
              <option value="block">Block over limit</option>
              <option value="alert">Alert only</option>
            </select>
            <button className="btn" onClick={() => void addBudget()} disabled={!budgetForm.name || !budgetForm.limitUsd}>Add budget</button>
          </div>
        </section>
      </div>

      {/* Virtual keys */}
      <section className="card">
        <h2>Virtual keys <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem", textTransform: "none" }}>· {keys.filter((k) => k.status === "active").length} active</span></h2>
        {keys.length > 0 && (
          <table style={{ marginBottom: "1rem" }}>
            <thead><tr><th>Key</th><th>Prefix</th><th>Team</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {keys.map((k) => {
                const team = teams.find((t) => t.id === k.teamId);
                const active = k.status === "active";
                return (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td className="mono">{k.keyPrefix ?? "—"}</td>
                    <td>{team ? team.name : "—"}</td>
                    <td>{active ? <span className="pill pill-success">active</span> : <span className="pill pill-error">revoked</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      {active && (
                        <button className="btn-sm btn-danger" onClick={() => void revokeKey(k.id)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="row">
          <input className="in" placeholder="Key name (e.g. priya — claude-code)" value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && keyForm.name && void addKey()} />
          <select className="in" value={keyForm.teamId} onChange={(e) => setKeyForm({ ...keyForm, teamId: e.target.value })}>
            <option value="">{teams[0] ? `Team: ${teams[0].name} (default)` : "No team"}</option>
            {teams.map((t) => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
          </select>
          <button className="btn" onClick={() => void addKey()} disabled={!keyForm.name}>Generate key</button>
        </div>
        {createdKey && (
          <div className="snippet" style={{ marginTop: "1rem" }}>
            <b>Copy this now — it&apos;s shown once:</b>
            <pre style={{ margin: "0.5rem 0 0" }}>{createdKey}</pre>
            <button className="btn-sm" style={{ marginTop: ".5rem" }} onClick={() => setCreatedKey(null)}>Dismiss</button>
          </div>
        )}
      </section>
    </>
  );
}
