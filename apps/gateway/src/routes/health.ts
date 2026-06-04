import { Hono } from "hono";
import { ping } from "@finops/db";
import { VERSION } from "../version";
import { pingClickhouse } from "../metering/clickhouse";
import { pingRedis } from "../budget/redis";

const startedAt = Date.now();

export const healthRoutes = new Hono();

// Liveness: is the process up? Always 200 if we can answer.
healthRoutes.get("/health", (c) =>
  c.json({
    status: "ok",
    version: VERSION,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  }),
);

// Readiness: can we serve traffic? Postgres is checked live (M2); ClickHouse
// and Redis are wired in their milestones (M3, M5).
healthRoutes.get("/ready", async (c) => {
  let postgres: "ok" | "down" = "down";
  try {
    await ping();
    postgres = "ok";
  } catch {
    postgres = "down";
  }

  // ClickHouse is the metering sink. It is NOT auth-critical, so its state is
  // reported but does not, by itself, fail readiness (metering is fail-open).
  let clickhouse: "ok" | "down" = "down";
  try {
    clickhouse = (await pingClickhouse()) ? "ok" : "down";
  } catch {
    clickhouse = "down";
  }

  // Redis backs live budget counters. Like ClickHouse it is non-auth-critical
  // (enforcement fails open), so it is reported but does not gate readiness.
  let redis: "ok" | "down" = "down";
  try {
    redis = (await pingRedis()) ? "ok" : "down";
  } catch {
    redis = "down";
  }

  const ready = postgres === "ok";
  return c.json(
    {
      ready,
      checks: { postgres, clickhouse, redis },
    },
    ready ? 200 : 503,
  );
});
