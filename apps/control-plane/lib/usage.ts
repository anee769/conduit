import { db, teams, organizations, loadModelPricing, loadBudgets } from "@finops/db";
import { chQuery } from "./clickhouse";

/**
 * Dashboard analytics. ClickHouse owns the heavy aggregation; Postgres supplies
 * human names (teams/orgs) and the price book (for the caching-savings metric).
 *
 * ClickHouse returns UInt64 aggregates (count/sum) as JSON *strings* to avoid
 * float precision loss — every numeric field is coerced with `n()`.
 */

const n = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

/** WHERE clause for a rolling window. `days` is an int we control (no injection). */
const since = (days: number) => `ts >= now() - INTERVAL ${Math.max(1, Math.floor(days))} DAY`;

export type Summary = {
  requests: number;
  blocked: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheSavingsUsd: number;
};

export type ModelRow = {
  provider: string;
  model: string;
  requests: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type TeamRow = { teamId: string | null; teamName: string; requests: number; costUsd: number };
export type DayRow = { day: string; costUsd: number; requests: number };
export type RecentRow = {
  ts: string;
  provider: string;
  model: string;
  status: string;
  httpStatus: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  teamName: string;
};

export async function getByModel(days: number): Promise<ModelRow[]> {
  const rows = await chQuery<Record<string, unknown>>(`
    SELECT provider, model,
           count() AS requests,
           sum(cost_usd) AS cost_usd,
           sum(input_tokens) AS input_tokens,
           sum(output_tokens) AS output_tokens,
           sum(cached_tokens) AS cached_tokens
    FROM usage_events
    WHERE ${since(days)}
    GROUP BY provider, model
    ORDER BY cost_usd DESC`);
  return rows.map((r) => ({
    provider: String(r.provider),
    model: String(r.model),
    requests: n(r.requests),
    costUsd: n(r.cost_usd),
    inputTokens: n(r.input_tokens),
    outputTokens: n(r.output_tokens),
    cachedTokens: n(r.cached_tokens),
  }));
}

/** Caching savings = cached tokens billed at the discount vs. full input price. */
async function cacheSavings(models: ModelRow[]): Promise<number> {
  const pricing = await loadModelPricing();
  const byKey = new Map(pricing.map((p) => [`${p.provider}:${p.model}`, p]));
  let savings = 0;
  for (const m of models) {
    if (m.cachedTokens <= 0) continue;
    const p =
      byKey.get(`${m.provider}:${m.model}`) ??
      pricing.find((x) => x.provider === m.provider && (m.model.includes(x.model) || x.model.includes(m.model)));
    if (!p || p.cacheReadPerMtokUsd == null) continue;
    savings += (m.cachedTokens * (p.inputPerMtokUsd - p.cacheReadPerMtokUsd)) / 1_000_000;
  }
  return savings;
}

export async function getSummary(days: number): Promise<Summary> {
  const [row] = await chQuery<Record<string, unknown>>(`
    SELECT count() AS requests,
           countIf(status = 'blocked') AS blocked,
           sum(cost_usd) AS cost_usd,
           sum(input_tokens) AS input_tokens,
           sum(output_tokens) AS output_tokens,
           sum(cached_tokens) AS cached_tokens
    FROM usage_events
    WHERE ${since(days)}`);
  const models = await getByModel(days);
  return {
    requests: n(row?.requests),
    blocked: n(row?.blocked),
    costUsd: n(row?.cost_usd),
    inputTokens: n(row?.input_tokens),
    outputTokens: n(row?.output_tokens),
    cachedTokens: n(row?.cached_tokens),
    cacheSavingsUsd: await cacheSavings(models),
  };
}

export async function getByTeam(days: number): Promise<TeamRow[]> {
  const rows = await chQuery<Record<string, unknown>>(`
    SELECT team_id, count() AS requests, sum(cost_usd) AS cost_usd
    FROM usage_events
    WHERE ${since(days)}
    GROUP BY team_id
    ORDER BY cost_usd DESC`);
  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams);
  const names = new Map(teamRows.map((t) => [t.id, t.name]));
  return rows.map((r) => {
    const teamId = r.team_id ? String(r.team_id) : null;
    return {
      teamId,
      teamName: teamId ? (names.get(teamId) ?? `team ${teamId.slice(0, 8)}`) : "Unassigned",
      requests: n(r.requests),
      costUsd: n(r.cost_usd),
    };
  });
}

export async function getTimeseries(days: number): Promise<DayRow[]> {
  const rows = await chQuery<Record<string, unknown>>(`
    SELECT toDate(ts) AS day, sum(cost_usd) AS cost_usd, count() AS requests
    FROM usage_events
    WHERE ${since(days)}
    GROUP BY day
    ORDER BY day`);
  return rows.map((r) => ({ day: String(r.day), costUsd: n(r.cost_usd), requests: n(r.requests) }));
}

export async function getRecent(limit = 25): Promise<RecentRow[]> {
  const rows = await chQuery<Record<string, unknown>>(`
    SELECT ts, provider, model, status, http_status, cost_usd, input_tokens, output_tokens, team_id
    FROM usage_events
    ORDER BY ts DESC
    LIMIT ${Math.max(1, Math.floor(limit))}`);
  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams);
  const names = new Map(teamRows.map((t) => [t.id, t.name]));
  return rows.map((r) => {
    const teamId = r.team_id ? String(r.team_id) : null;
    return {
      ts: String(r.ts),
      provider: String(r.provider),
      model: String(r.model),
      status: String(r.status),
      httpStatus: n(r.http_status),
      costUsd: n(r.cost_usd),
      inputTokens: n(r.input_tokens),
      outputTokens: n(r.output_tokens),
      teamName: teamId ? (names.get(teamId) ?? "—") : "Unassigned",
    };
  });
}

export async function orgName(): Promise<string> {
  const [org] = await db.select({ name: organizations.name }).from(organizations).limit(1);
  return org?.name ?? "Your Organization";
}

export type BudgetStatus = {
  name: string;
  scope: string;
  periodType: string;
  action: string;
  limitUsd: number;
  spentUsd: number;
  pct: number;
};

/**
 * Current-period spend vs each configured budget. Spend is read from ClickHouse
 * (authoritative history) rather than the Redis live counter, so the dashboard
 * is correct even if Redis was flushed.
 */
export async function getBudgetStatus(): Promise<BudgetStatus[]> {
  const [defs, teamRows] = await Promise.all([
    loadBudgets(),
    db.select({ id: teams.id, name: teams.name }).from(teams),
  ]);
  const names = new Map(teamRows.map((t) => [t.id, t.name]));

  const out: BudgetStatus[] = [];
  for (const b of defs) {
    const periodFilter =
      b.periodType === "daily"
        ? "toDate(ts) = today()"
        : "toStartOfMonth(ts) = toStartOfMonth(now())";
    // Always scope to the budget's org; add the team filter only for team caps.
    const scopeFilter = `org_id = '${b.orgId}'` + (b.teamId ? ` AND team_id = '${b.teamId}'` : "");
    const [row] = await chQuery<Record<string, unknown>>(
      `SELECT sum(cost_usd) AS spent FROM usage_events WHERE ${periodFilter} AND ${scopeFilter}`,
    );
    const spentUsd = n(row?.spent);
    out.push({
      name: b.name,
      scope: b.teamId ? (names.get(b.teamId) ?? "Team") : "Org-wide",
      periodType: b.periodType,
      action: b.action,
      limitUsd: b.limitUsd,
      spentUsd,
      pct: b.limitUsd > 0 ? Math.min(999, (spentUsd / b.limitUsd) * 100) : 0,
    });
  }
  return out;
}
