import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import pino from "pino";
import type { RequestType, UsageEvent, UsageStatus } from "@finops/types";
import {
  lookupVirtualKey,
  getProviderCredential,
  touchVirtualKeyLastUsed,
} from "@finops/db";
import { config } from "../config";
import {
  proxyRequests,
  proxyLatency,
  proxyCost,
  proxyTokens,
  cacheHits,
  cacheSavings,
  rateLimited,
} from "./metrics";
import { parseUsage } from "../metering/usage";
import { costFor } from "../metering/pricing";
import { enqueueUsage } from "../metering/buffer";
import { checkBudgets, recordSpend } from "../budget/enforce";
import { checkRateLimit } from "../ratelimit/ratelimit";
import { CACHE_ENABLED, cacheKeyFor, cacheGet, cacheSet } from "../cache/cache";

const logger = pino({ name: "proxy" });

// Map the matched route to a usage request-type. Order matters: the chat route
// also ends in "/completions".
function requestTypeFor(pathname: string): RequestType {
  if (pathname.endsWith("/embeddings")) return "embedding";
  if (pathname.endsWith("/chat/completions")) return "chat";
  if (pathname.endsWith("/completions")) return "completion";
  return "chat";
}

type MeterCtx = {
  provider: UpstreamProvider;
  model: string;
  requestType: RequestType;
  orgId: string;
  teamId: string | null;
  vkId: string;
  start: number;
  httpStatus: number;
  status: UsageStatus;
  requestId: string | null;
  cacheKey?: string | null;
};

/** Build + enqueue a usage event. Fire-and-forget; never on the client path. */
function record(ctx: MeterCtx, u: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }, latencyMs: number, ttftMs: number | null): void {
  // A cache hit incurs no upstream spend, regardless of the tokens it served.
  const costUsd = ctx.status === "cache_hit" ? 0 : costFor(ctx.provider, ctx.model, u);
  const event: UsageEvent = {
    eventId: randomUUID(),
    orgId: ctx.orgId,
    teamId: ctx.teamId,
    virtualKeyId: ctx.vkId,
    ts: new Date(ctx.start).toISOString(),
    provider: ctx.provider === "anthropic" ? "anthropic" : "openai",
    model: ctx.model,
    requestType: ctx.requestType,
    status: ctx.status,
    httpStatus: ctx.httpStatus,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cachedTokens: u.cacheReadTokens,
    costUsd,
    latencyMs,
    ttftMs,
    cacheHit: ctx.status === "cache_hit", // exact-match response cache (M6)
    errorCode: ctx.status === "error" ? String(ctx.httpStatus) : null,
    requestId: ctx.requestId,
  };
  enqueueUsage(event);

  // Feed the live budget counters (only real spend; blocked/errored = no cost).
  if (ctx.status === "success" && costUsd > 0) {
    void recordSpend(ctx.orgId, ctx.teamId, costUsd);
  }

  proxyCost.inc({ provider: ctx.provider, model: ctx.model }, costUsd);
  proxyTokens.inc({ provider: ctx.provider, model: ctx.model, kind: "input" }, u.inputTokens);
  proxyTokens.inc({ provider: ctx.provider, model: ctx.model, kind: "output" }, u.outputTokens);
  proxyTokens.inc({ provider: ctx.provider, model: ctx.model, kind: "cached" }, u.cacheReadTokens);
}

/**
 * Drain the metering branch of a tee'd response in the background: time the
 * first byte (TTFT), accumulate the body text, parse usage, and record the
 * event. Errors here are swallowed — metering must not affect the client.
 */
async function meterStream(
  ctx: MeterCtx,
  stream: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let ttftMs: number | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttftMs === null) ttftMs = Date.now() - ctx.start;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (err) {
    logger.warn({ err: String(err) }, "meter stream read failed");
  } finally {
    reader.releaseLock();
  }
  const usage = parseUsage(ctx.provider, contentType, text);

  // Populate the exact-match cache from a successful response (M6). Stores the
  // body + parsed usage + original cost so each future hit can report what it
  // saved. Only 2xx bodies are cached — never errors.
  if (ctx.cacheKey && ctx.httpStatus >= 200 && ctx.httpStatus < 300) {
    void cacheSet(ctx.cacheKey, {
      status: ctx.httpStatus,
      contentType,
      body: text,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      costUsd: costFor(ctx.provider, ctx.model, usage),
    });
  }

  record(ctx, usage, Date.now() - ctx.start, ttftMs);
}

// Routes only ever forward to these two upstreams (Azure is OpenAI-compatible
// via a per-credential baseUrl override).
type UpstreamProvider = "anthropic" | "openai";

// Hop-by-hop headers must not cross a proxy (RFC 7230 §6.1). content-length is
// dropped so fetch recomputes it; content-encoding is preserved so the client
// keeps decoding the streamed bytes.
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
  "te",
  "trailer",
]);

function extractToken(c: Context): string | null {
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const xApiKey = c.req.header("x-api-key");
  if (xApiKey) return xApiKey.trim();
  return null;
}

/**
 * Build the upstream request headers: forward the client's headers, but DROP
 * their auth (the virtual key) and INJECT the real, decrypted provider key.
 * Clients therefore never hold a raw provider credential.
 */
function buildUpstreamHeaders(
  incoming: Record<string, string>,
  provider: UpstreamProvider,
  realKey: string,
): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === "authorization" || lower === "x-api-key") continue;
    out.set(key, value);
  }
  if (provider === "anthropic") {
    out.set("x-api-key", realKey);
    if (!out.has("anthropic-version")) out.set("anthropic-version", "2023-06-01");
  } else {
    out.set("authorization", `Bearer ${realKey}`);
  }
  return out;
}

function stripResponseHeaders(source: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of source.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.set(key, value);
  }
  return out;
}

async function forward(c: Context, provider: UpstreamProvider) {
  const start = Date.now();

  // 1. Authenticate the virtual key.
  const token = extractToken(c);
  if (!token || !token.startsWith("vk_")) {
    return c.json(
      { error: { message: "missing or invalid virtual key", type: "authentication_error" } },
      401,
    );
  }

  let vk;
  try {
    vk = await lookupVirtualKey(token);
  } catch (err) {
    // Auth is a security control → fail CLOSED if the backend is unavailable.
    logger.error({ err: String(err) }, "virtual key lookup failed");
    return c.json({ error: { message: "authentication backend unavailable" } }, 503);
  }
  if (!vk || vk.status !== "active") {
    return c.json(
      { error: { message: "invalid or revoked virtual key", type: "authentication_error" } },
      401,
    );
  }

  // 2. Read body once; peek the model (metadata only — body is not persisted).
  const rawBody = await c.req.arrayBuffer();
  let model = "unknown";
  try {
    model = JSON.parse(new TextDecoder().decode(rawBody))?.model ?? "unknown";
  } catch {
    /* non-JSON body */
  }

  const pathname = new URL(c.req.url).pathname;
  const requestType = requestTypeFor(pathname);

  // 2b. Per-key rate limit (fail-open on Redis error).
  const rl = await checkRateLimit(vk.id, vk.rateLimitRpm);
  if (rl.limited) {
    rateLimited.inc({ provider });
    proxyRequests.inc({ provider, status: "429" });
    logger.warn({ vkId: vk.id, rpm: rl.limit, current: rl.current }, "rate limit exceeded");
    record(
      {
        provider, model, requestType,
        orgId: vk.orgId, teamId: vk.teamId, vkId: vk.id,
        start, httpStatus: 429, status: "blocked", requestId: null,
      },
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      Date.now() - start,
      null,
    );
    return c.json(
      { error: { message: `rate limit exceeded (${rl.limit} req/min)`, type: "rate_limit_error" } },
      429,
    );
  }

  // 3. Enforce per-key model allow-list.
  if (vk.allowedModels && vk.allowedModels.length > 0 && !vk.allowedModels.includes(model)) {
    proxyRequests.inc({ provider, status: "403" });
    logger.warn({ provider, model, vkId: vk.id }, "model not allowed for key");
    record(
      {
        provider, model, requestType,
        orgId: vk.orgId, teamId: vk.teamId, vkId: vk.id,
        start, httpStatus: 403, status: "blocked", requestId: null,
      },
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      Date.now() - start,
      null,
    );
    return c.json(
      { error: { message: `model '${model}' is not allowed for this key`, type: "permission_error" } },
      403,
    );
  }

  // 3b. Enforce spend budgets (fail-closed only on a KNOWN overage).
  const over = await checkBudgets(vk.orgId, vk.teamId);
  if (over) {
    proxyRequests.inc({ provider, status: "402" });
    logger.warn(
      { orgId: vk.orgId, teamId: vk.teamId, budget: over.name, spent: over.spentUsd, limit: over.limitUsd },
      "budget exceeded — blocking",
    );
    record(
      {
        provider, model, requestType,
        orgId: vk.orgId, teamId: vk.teamId, vkId: vk.id,
        start, httpStatus: 402, status: "blocked", requestId: null,
      },
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      Date.now() - start,
      null,
    );
    const fmt = (v: number) => (v < 0.01 ? v.toFixed(6) : v.toFixed(2));
    return c.json(
      {
        error: {
          message: `budget '${over.name}' exceeded for the ${over.periodType} period ($${fmt(over.spentUsd)} spent / $${fmt(over.limitUsd)} limit)`,
          type: "budget_exceeded",
        },
      },
      402,
    );
  }

  // 3c. Exact-match cache lookup (M6). Enforced AFTER auth/allow-list/budget so
  // a cache hit can never bypass policy. A hit serves the stored body with a
  // cache header, records a cache_hit event (zero cost), and skips the upstream.
  const cacheKey = CACHE_ENABLED ? cacheKeyFor(provider, pathname, rawBody) : null;
  if (cacheKey) {
    const hit = await cacheGet(cacheKey);
    if (hit) {
      cacheHits.inc({ provider });
      cacheSavings.inc({ provider, model }, hit.costUsd);
      proxyRequests.inc({ provider, status: "cache_hit" });
      record(
        {
          provider, model, requestType,
          orgId: vk.orgId, teamId: vk.teamId, vkId: vk.id,
          start, httpStatus: hit.status, status: "cache_hit", requestId: null,
        },
        {
          inputTokens: hit.inputTokens, outputTokens: hit.outputTokens,
          cacheReadTokens: hit.cacheReadTokens, cacheCreationTokens: hit.cacheCreationTokens,
        },
        Date.now() - start,
        0,
      );
      return new Response(hit.body, {
        status: hit.status,
        headers: { "content-type": hit.contentType, "x-finops-cache": "hit" },
      });
    }
  }

  // 4. Resolve + decrypt the org's provider credential.
  let cred;
  try {
    cred = await getProviderCredential(vk.orgId, provider);
  } catch (err) {
    logger.error({ err: String(err) }, "provider credential lookup failed");
    return c.json({ error: { message: "credential backend unavailable" } }, 503);
  }
  if (!cred) {
    proxyRequests.inc({ provider, status: "no_credential" });
    return c.json(
      { error: { message: `no enabled ${provider} credential configured`, type: "configuration_error" } },
      502,
    );
  }

  // 5. Forward to the upstream, injecting the real provider key.
  const baseUrl = cred.baseUrl ?? config.upstreams[provider];
  const incoming = new URL(c.req.url);
  const target = new URL(incoming.pathname + incoming.search, baseUrl);
  const headers = buildUpstreamHeaders(c.req.header(), provider, cred.apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: c.req.method,
      headers,
      body: rawBody.byteLength > 0 ? rawBody : undefined,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    proxyRequests.inc({ provider, status: "error" });
    const cause = (err as { cause?: unknown })?.cause;
    logger.error(
      { provider, model, latencyMs, err: String(err), cause: cause ? String(cause) : undefined },
      "upstream request failed",
    );
    return c.json({ error: { message: "upstream request failed", provider } }, 502);
  }

  const headerLatencyMs = Date.now() - start;
  proxyRequests.inc({ provider, status: String(upstream.status) });
  proxyLatency.observe({ provider }, headerLatencyMs / 1000);
  logger.info(
    {
      provider,
      model,
      orgId: vk.orgId,
      teamId: vk.teamId,
      vkId: vk.id,
      method: c.req.method,
      path: incoming.pathname,
      status: upstream.status,
      latencyMs: headerLatencyMs,
    },
    "proxied",
  );

  // Best-effort, non-blocking last-used update.
  void touchVirtualKeyLastUsed(vk.id).catch(() => {});

  const meterCtx: MeterCtx = {
    provider,
    model,
    requestType,
    orgId: vk.orgId,
    teamId: vk.teamId,
    vkId: vk.id,
    start,
    httpStatus: upstream.status,
    status: upstream.ok ? "success" : "error",
    requestId: upstream.headers.get("request-id") ?? upstream.headers.get("x-request-id"),
    cacheKey, // populate the cache from this response when it streams clean
  };
  const contentType = upstream.headers.get("content-type") ?? "";
  // Tell clients whether this was served fresh (a hit returns earlier).
  const passHeaders = stripResponseHeaders(upstream.headers);
  passHeaders.set("x-finops-cache", "miss");

  // 6. Tee the body: one branch streams to the client untouched (SSE-safe), the
  // other is drained in the background for token/cost accounting. The tee adds
  // no latency — both branches receive each chunk as it arrives.
  if (upstream.body) {
    const [clientBranch, meterBranch] = upstream.body.tee();
    void meterStream(meterCtx, meterBranch, contentType);
    return new Response(clientBranch, { status: upstream.status, headers: passHeaders });
  }

  // Bodyless response (e.g. 204): record a zero-token event.
  record(
    meterCtx,
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    headerLatencyMs,
    null,
  );
  return new Response(null, { status: upstream.status, headers: passHeaders });
}

export const proxyRoutes = new Hono();

// Anthropic native surface — what Claude Code talks to (ANTHROPIC_BASE_URL).
proxyRoutes.post("/v1/messages", (c) => forward(c, "anthropic"));

// OpenAI-compatible surface — Codex / OpenAI SDK clients.
proxyRoutes.post("/v1/chat/completions", (c) => forward(c, "openai"));
proxyRoutes.post("/v1/completions", (c) => forward(c, "openai"));
proxyRoutes.post("/v1/embeddings", (c) => forward(c, "openai"));
