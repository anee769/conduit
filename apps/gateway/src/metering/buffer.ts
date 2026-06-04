import pino from "pino";
import type { UsageEvent } from "@finops/types";
import { chInsert } from "./clickhouse";

/**
 * In-process write buffer for usage events. Metering must NEVER slow a proxied
 * request, so events are enqueued fire-and-forget and flushed to ClickHouse in
 * batches — on a size threshold or a timer, whichever comes first.
 *
 * Trade-off: a crash can lose at most one un-flushed batch (seconds of events).
 * That is acceptable for cost analytics; budgets that must be exact use Redis
 * counters (M5), not this pipeline.
 */

const logger = pino({ name: "meter" });

const BATCH_SIZE = Number(process.env.METER_BATCH_SIZE ?? 100);
const FLUSH_MS = Number(process.env.METER_FLUSH_MS ?? 2000);

let queue: UsageEvent[] = [];
let flushing = false;

/** ISO -> ClickHouse DateTime64(3) literal ("YYYY-MM-DD HH:MM:SS.mmm", UTC). */
function chDateTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace("Z", "");
}

function toRow(e: UsageEvent): Record<string, unknown> {
  return {
    event_id: e.eventId,
    org_id: e.orgId,
    team_id: e.teamId,
    virtual_key_id: e.virtualKeyId,
    ts: chDateTime(e.ts),
    provider: e.provider,
    model: e.model,
    request_type: e.requestType,
    status: e.status,
    http_status: e.httpStatus,
    input_tokens: e.inputTokens,
    output_tokens: e.outputTokens,
    cached_tokens: e.cachedTokens,
    cost_usd: e.costUsd,
    latency_ms: e.latencyMs,
    ttft_ms: e.ttftMs,
    cache_hit: e.cacheHit ? 1 : 0,
    error_code: e.errorCode,
    request_id: e.requestId,
  };
}

/** Enqueue an event. Non-blocking; triggers a flush once the batch is full. */
export function enqueueUsage(event: UsageEvent): void {
  queue.push(event);
  if (queue.length >= BATCH_SIZE) void flush();
}

/** Drain the current queue to ClickHouse. Safe to call concurrently. */
export async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue;
  queue = [];
  try {
    await chInsert("usage_events", batch.map(toRow));
  } catch (err) {
    // Don't lose the batch on a transient ClickHouse hiccup — requeue (bounded).
    logger.warn({ err: String(err), n: batch.length }, "usage flush failed; requeueing");
    if (queue.length < BATCH_SIZE * 50) queue = batch.concat(queue);
  } finally {
    flushing = false;
  }
}

/** Start the periodic flush loop. Returns a stop() for graceful shutdown. */
export function startMeterBuffer(): () => Promise<void> {
  const timer = setInterval(() => void flush(), FLUSH_MS);
  timer.unref?.();
  logger.info({ batchSize: BATCH_SIZE, flushMs: FLUSH_MS }, "meter buffer started");
  return async () => {
    clearInterval(timer);
    await flush();
  };
}
