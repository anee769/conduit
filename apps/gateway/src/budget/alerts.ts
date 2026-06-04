import pino from "pino";
import type { Budget } from "@finops/db";
import { redis } from "./redis";
import { periodTtlSec } from "./period";

/**
 * Budget threshold alerts. As spend accrues we fire once per threshold per
 * period (deduped with a Redis SET NX marker) so an admin hears about a runaway
 * spend BEFORE a hard cap trips — and at all, for soft 'alert' budgets that
 * never block. Delivery is a log line plus an optional webhook POST.
 */

const logger = pino({ name: "alert" });

const THRESHOLDS = [50, 80, 100];
const WEBHOOK = process.env.ALERT_WEBHOOK_URL;

async function deliver(payload: Record<string, unknown>): Promise<void> {
  logger.warn(payload, "budget alert");
  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "alert webhook failed");
  }
}

/** Fire any newly-crossed thresholds for one budget. Best-effort, idempotent. */
export async function maybeAlert(counterKey: string, b: Budget, newSpendUsd: number): Promise<void> {
  for (const pct of THRESHOLDS) {
    if (newSpendUsd < (b.limitUsd * pct) / 100) continue;
    const marker = `alerted:${counterKey}:${pct}`;
    try {
      const first = await redis.set(marker, "1", "EX", periodTtlSec(b.periodType), "NX");
      if (first === "OK") {
        await deliver({
          budget: b.name,
          action: b.action,
          period: b.periodType,
          threshold_pct: pct,
          spent_usd: Number(newSpendUsd.toFixed(6)),
          limit_usd: b.limitUsd,
        });
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "alert dedupe failed");
    }
  }
}
