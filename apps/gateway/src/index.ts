import { serve } from "@hono/node-server";
import { Hono } from "hono";
import pino from "pino";
import { config } from "./config";
import { VERSION } from "./version";
import { healthRoutes } from "./routes/health";
import { metricsRoutes } from "./routes/metrics";
import { proxyRoutes } from "./routes/proxy";
import { adminRoutes } from "./routes/admin";
import { initUsageSchema } from "./metering/clickhouse";
import { loadPricing, startPricingRefresh } from "./metering/pricing";
import { startMeterBuffer } from "./metering/buffer";
import { loadBudgetCache, startBudgetRefresh } from "./budget/enforce";

const logger = pino({ name: "finops-gateway" });

const app = new Hono();

app.route("/", healthRoutes);
app.route("/", metricsRoutes);
app.route("/", adminRoutes);
app.route("/", proxyRoutes);

app.get("/", (c) =>
  c.json({ name: "AI FinOps Gateway", version: VERSION, failMode: config.failMode }),
);

// Metering bootstrap. These are best-effort: a metering backend that is down
// must not stop the gateway from proxying (fail-open). Failures are logged and
// surfaced via /ready, not by refusing traffic.
async function bootMetering(): Promise<void> {
  try {
    await initUsageSchema();
  } catch (err) {
    logger.warn({ err: String(err) }, "clickhouse schema init failed (metering degraded)");
  }
  try {
    await loadPricing();
  } catch (err) {
    logger.warn({ err: String(err) }, "pricing load failed (cost calc will be 0 until loaded)");
  }
  startPricingRefresh();
  try {
    await loadBudgetCache();
  } catch (err) {
    logger.warn({ err: String(err) }, "budget load failed (enforcement disabled until loaded)");
  }
  startBudgetRefresh();
}

const stopMeterBuffer = startMeterBuffer();
await bootMetering();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(
    {
      version: VERSION,
      port: info.port,
      failMode: config.failMode,
      upstreams: config.upstreams,
    },
    "gateway started",
  );
});

// Flush buffered usage before exit so we don't drop the last batch.
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  server.close();
  await stopMeterBuffer();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
