import pino from "pino";
import { loadBudgets, type Budget } from "@finops/db";
import { config } from "../config";
import { redis } from "./redis";
import { periodBucket, periodTtlSec } from "./period";
import { maybeAlert } from "./alerts";

/**
 * Live budget enforcement.
 *
 * Budget DEFINITIONS are cached in memory (refreshed periodically), so the hot
 * path only touches Redis for the live COUNTERS. Enforcement is "block once the
 * period's recorded spend has reached the limit": the cost of the in-flight
 * request isn't known until it completes, so the request that crosses the line
 * is allowed and the next one is rejected. Counters are incremented from the
 * (background) metering path, never on the request's critical path.
 *
 * Failure policy: hard caps fail CLOSED only when we positively know the limit
 * is exceeded. If Redis can't be read, we fail OPEN — a cost control must not
 * take a customer's coding assistants offline over a cache blip.
 */

const logger = pino({ name: "budget" });

let byOrg = new Map<string, Budget[]>();

export async function loadBudgetCache(): Promise<void> {
  const rows = await loadBudgets();
  const next = new Map<string, Budget[]>();
  for (const b of rows) {
    const arr = next.get(b.orgId) ?? [];
    arr.push(b);
    next.set(b.orgId, arr);
  }
  byOrg = next;
  logger.info({ budgets: rows.length }, "budgets loaded");
}

export function startBudgetRefresh(everyMs = 5 * 60_000): void {
  const t = setInterval(() => {
    loadBudgetCache().catch((err) => logger.warn({ err: String(err) }, "budget refresh failed"));
  }, everyMs);
  t.unref?.();
}

/** Budgets that apply to a request: org-wide ones + the request team's own. */
function applicable(orgId: string, teamId: string | null): Budget[] {
  const all = byOrg.get(orgId) ?? [];
  return all.filter((b) => b.teamId == null || b.teamId === teamId);
}

function counterKey(orgId: string, b: Budget): string {
  const scope = b.teamId ?? "org";
  return `spend:${orgId}:${scope}:${b.periodType}:${periodBucket(b.periodType)}`;
}

export type BudgetBlock = { name: string; limitUsd: number; spentUsd: number; periodType: string };

/** First exceeded BLOCK budget for this request, or null. Fail-open on error. */
export async function checkBudgets(orgId: string, teamId: string | null): Promise<BudgetBlock | null> {
  const buds = applicable(orgId, teamId).filter((b) => b.action === "block");
  if (buds.length === 0) return null;
  try {
    const vals = await redis.mget(...buds.map((b) => counterKey(orgId, b)));
    for (let i = 0; i < buds.length; i++) {
      const spent = Number(vals[i] ?? 0);
      if (spent >= buds[i]!.limitUsd) {
        return { name: buds[i]!.name, limitUsd: buds[i]!.limitUsd, spentUsd: spent, periodType: buds[i]!.periodType };
      }
    }
    return null;
  } catch (err) {
    // Can't evaluate the cap. FAIL_MODE decides: 'closed' blocks (max safety for
    // spend control), 'open' (default) lets traffic through (max availability).
    if (config.failMode === "closed") {
      logger.warn({ err: String(err) }, "budget check failed — FAIL_MODE=closed → blocking");
      return { name: "fail-closed", limitUsd: 0, spentUsd: 0, periodType: "unknown" };
    }
    logger.warn({ err: String(err) }, "budget check failed — failing open");
    return null;
  }
}

/** Add a completed request's cost to every applicable counter. Best-effort. */
export async function recordSpend(orgId: string, teamId: string | null, costUsd: number): Promise<void> {
  if (costUsd <= 0) return;
  const buds = applicable(orgId, teamId);
  if (buds.length === 0) return;
  try {
    const keys = buds.map((b) => counterKey(orgId, b));
    const pipe = redis.pipeline();
    buds.forEach((b, i) => {
      pipe.incrbyfloat(keys[i]!, costUsd);
      pipe.expire(keys[i]!, periodTtlSec(b.periodType));
    });
    const res = await pipe.exec(); // [[err, value], ...] — incrbyfloat at index 2*i
    buds.forEach((b, i) => {
      const newSpend = Number(res?.[i * 2]?.[1] ?? 0);
      void maybeAlert(keys[i]!, b, newSpend);
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "budget counter increment failed");
  }
}
