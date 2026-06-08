import { Hono } from "hono";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

// Shared Prometheus registry. Custom counters (tokens, cost, cache hits) get
// registered here as later milestones add them.
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

// Proxy request counter, labelled by provider and upstream status class.
export const proxyRequests = new Counter({
  name: "gateway_proxy_requests_total",
  help: "Total proxied requests, by provider and HTTP status.",
  labelNames: ["provider", "status"] as const,
  registers: [registry],
});

// Upstream latency (gateway → provider → first response).
export const proxyLatency = new Histogram({
  name: "gateway_proxy_latency_seconds",
  help: "Upstream request latency in seconds, by provider.",
  labelNames: ["provider"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

// Running USD cost, by provider + model (M3 metering).
export const proxyCost = new Counter({
  name: "gateway_cost_usd_total",
  help: "Estimated upstream cost in USD, by provider and model.",
  labelNames: ["provider", "model"] as const,
  registers: [registry],
});

// Token throughput, by provider + model + kind (input/output/cached).
export const proxyTokens = new Counter({
  name: "gateway_tokens_total",
  help: "Token counts, by provider, model and kind (input|output|cached).",
  labelNames: ["provider", "model", "kind"] as const,
  registers: [registry],
});

// Exact-match cache hits (M6) and the upstream cost they avoided.
export const cacheHits = new Counter({
  name: "gateway_cache_hits_total",
  help: "Exact-match cache hits, by provider.",
  labelNames: ["provider"] as const,
  registers: [registry],
});
export const cacheSavings = new Counter({
  name: "gateway_cache_savings_usd_total",
  help: "USD avoided by serving from the exact-match cache.",
  labelNames: ["provider", "model"] as const,
  registers: [registry],
});

// Requests rejected by per-key rate limiting (M6).
export const rateLimited = new Counter({
  name: "gateway_rate_limited_total",
  help: "Requests rejected by per-virtual-key rate limiting.",
  labelNames: ["provider"] as const,
  registers: [registry],
});

// Data governance: requests where the T1 secrets scan detected sensitive data,
// by provider, category, and action taken (alert|block). Phase 2.
export const governanceFlags = new Counter({
  name: "gateway_governance_flags_total",
  help: "Requests where governance detected sensitive data, by provider, category and action.",
  labelNames: ["provider", "category", "action"] as const,
  registers: [registry],
});

export const metricsRoutes = new Hono();

metricsRoutes.get("/metrics", async (c) => {
  const body = await registry.metrics();
  return c.text(body, 200, { "Content-Type": registry.contentType });
});
