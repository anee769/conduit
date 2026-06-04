import { z } from "zod";

/**
 * Shared domain types for the AI FinOps Gateway.
 * These mirror the data model in MVP_SPEC.md §5 and are the contract
 * shared across the gateway and the control plane.
 */

// ── Enumerations ───────────────────────────────────────────────────────────

export const Provider = z.enum(["openai", "anthropic", "azure"]);
export type Provider = z.infer<typeof Provider>;

export const RequestType = z.enum(["chat", "completion", "embedding"]);
export type RequestType = z.infer<typeof RequestType>;

export const UsageStatus = z.enum(["success", "error", "blocked", "cache_hit"]);
export type UsageStatus = z.infer<typeof UsageStatus>;

export const FailMode = z.enum(["open", "closed"]);
export type FailMode = z.infer<typeof FailMode>;

// ── Usage event (ClickHouse `usage_events`, metadata only — no bodies) ──────

export const UsageEvent = z.object({
  eventId: z.string().uuid(),
  orgId: z.string().uuid(),
  teamId: z.string().uuid().nullable(),
  virtualKeyId: z.string().uuid().nullable(),
  ts: z.string().datetime(),
  provider: Provider,
  model: z.string(),
  requestType: RequestType,
  status: UsageStatus,
  httpStatus: z.number().int(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().default(0),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  ttftMs: z.number().int().nonnegative().nullable(),
  cacheHit: z.boolean(),
  errorCode: z.string().nullable(),
  requestId: z.string().nullable(),
});
export type UsageEvent = z.infer<typeof UsageEvent>;

// ── Gateway runtime config ──────────────────────────────────────────────────

export const GatewayConfig = z.object({
  port: z.number().int().positive().default(4000),
  failMode: FailMode.default("open"),
});
export type GatewayConfig = z.infer<typeof GatewayConfig>;
