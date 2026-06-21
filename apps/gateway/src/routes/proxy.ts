import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import pino from "pino";
import type { RequestType, UsageEvent, UsageStatus } from "@finops/types";
import {
  lookupVirtualKey,
  touchVirtualKeyLastUsed,
} from "@finops/db";
import { config } from "../config";
import { adapterFor, resolveCredential } from "../adapters";
import {
  proxyRequests,
  proxyLatency,
  proxyCost,
  proxyTokens,
  cacheHits,
  cacheSavings,
  rateLimited,
  governanceFlags,
} from "./metrics";
import { scanSecrets, scanEntities, categoriesOf } from "../governance/scan";
import { governanceConfig, effectiveAction } from "../governance/policy";
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
  governanceCategories?: string[];
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
    governanceFlagged: (ctx.governanceCategories?.length ?? 0) > 0,
    governanceCategories: ctx.governanceCategories ?? [],
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
// dropped so fetch recomputes it; content-encoding is stripped because Node's
// undici fetch decompresses the upstream response body automatically — passing
// the header through with an already-decompressed body causes clients to try a
// second round of decompression (Z_DATA_ERROR / TypeError: terminated).
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "content-encoding",
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

  // 2. Read body once; peek the model + stream flag (metadata only — body is not persisted).
  const rawBody = await c.req.arrayBuffer();
  let model = "unknown";
  let wantsStream = false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(rawBody));
    model = parsed?.model ?? "unknown";
    wantsStream = parsed?.stream === true;
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

  // 3d. Data governance (Phase 2). Scan the request body for high-confidence
  // secrets BEFORE it can leave the perimeter for the provider. Runs after the
  // cheaper policy checks (don't pay the scan on a request we'd reject anyway)
  // and before the cache (a flagged/blocked request must not be cached/served).
  // PRIVACY: only categories are recorded — never the matched value.
  let govCategories: string[] = [];
  const gov = governanceConfig();
  if (gov.enabled && rawBody.byteLength > 0) {
    const decoded = new TextDecoder().decode(rawBody);
    const hits = [...scanSecrets(decoded), ...scanEntities(decoded, gov.entities)];
    if (hits.length > 0) {
      govCategories = categoriesOf(hits);
      // Per-request action: block if the global mode is block OR any hit category
      // has been promoted to block (the alert→block feedback loop).
      const action = effectiveAction(govCategories);
      for (const cat of govCategories) {
        governanceFlags.inc({ provider, category: cat, action });
      }
      logger.warn(
        { vkId: vk.id, orgId: vk.orgId, categories: govCategories, action },
        "governance: sensitive data detected in request",
      );
      if (action === "block") {
        proxyRequests.inc({ provider, status: "451" });
        record(
          {
            provider, model, requestType,
            orgId: vk.orgId, teamId: vk.teamId, vkId: vk.id,
            start, httpStatus: 451, status: "blocked", requestId: null,
            governanceCategories: govCategories,
          },
          { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
          Date.now() - start,
          null,
        );
        return c.json(
          {
            error: {
              message: `request blocked by data governance policy (detected: ${govCategories.join(", ")})`,
              type: "governance_blocked",
            },
          },
          451,
        );
      }
      // alert mode: fall through — the request proceeds, the flag is recorded.
    }
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
          governanceCategories: govCategories,
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

  // 4. Resolve + decrypt the org's upstream credential. `provider` is the client
  // API family (anthropic | openai); the resolver picks the actual provider —
  // preferring a perimeter provider (Bedrock / Azure) when one is configured.
  let cred;
  try {
    cred = await resolveCredential(vk.orgId, provider);
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

  // 5. Forward to the upstream via the provider adapter (URL + auth + any body
  // rewrite). The meter provider stays the family — Azure meters as OpenAI,
  // Bedrock as Anthropic — so the rest of the hot path doesn't branch on this.
  const adapter = adapterFor(cred.providerKind);
  const incoming = new URL(c.req.url);
  const upstreamReq = {
    method: c.req.method,
    pathname: incoming.pathname,
    search: incoming.search,
    model,
    headers: c.req.header(),
    body: rawBody,
    stream: wantsStream,
  };

  if (wantsStream && !adapter.supportsStreaming(upstreamReq)) {
    proxyRequests.inc({ provider, status: "400" });
    logger.warn({ provider, providerKind: cred.providerKind, model }, "streaming not supported for provider");
    return c.json(
      {
        error: {
          message: `streaming is not yet supported via ${cred.providerKind}; retry with "stream": false`,
          type: "unsupported_request",
        },
      },
      400,
    );
  }

  let prepared;
  try {
    prepared = adapter.prepare(cred, upstreamReq, config.upstreams[provider]);
  } catch (err) {
    proxyRequests.inc({ provider, status: "error" });
    logger.error({ err: String(err), providerKind: cred.providerKind }, "adapter prepare failed");
    return c.json({ error: { message: "upstream credential misconfigured", provider } }, 502);
  }

  let upstream: Response;
  try {
    upstream = await fetch(prepared.url, {
      method: c.req.method,
      headers: prepared.headers,
      body: prepared.body,
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
    governanceCategories: govCategories,
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

/**
 * Lightweight authenticated passthrough for utility endpoints that carry no
 * billable usage — currently Anthropic's `/v1/messages/count_tokens`, which
 * Claude Code calls frequently to size the context window. We still enforce the
 * virtual key and inject the real credential, but DON'T meter (no cost, and it
 * keeps utility calls out of the spend/attribution numbers) and DON'T scan/cache.
 */
async function passthrough(c: Context, family: UpstreamProvider) {
  const token = extractToken(c);
  if (!token || !token.startsWith("vk_")) {
    return c.json({ error: { message: "missing or invalid virtual key", type: "authentication_error" } }, 401);
  }
  let vk;
  try {
    vk = await lookupVirtualKey(token);
  } catch (err) {
    logger.error({ err: String(err) }, "virtual key lookup failed");
    return c.json({ error: { message: "authentication backend unavailable" } }, 503);
  }
  if (!vk || vk.status !== "active") {
    return c.json({ error: { message: "invalid or revoked virtual key", type: "authentication_error" } }, 401);
  }

  const rawBody = await c.req.arrayBuffer();
  let model = "unknown";
  try {
    model = JSON.parse(new TextDecoder().decode(rawBody))?.model ?? "unknown";
  } catch {
    /* non-JSON body */
  }

  let cred;
  try {
    cred = await resolveCredential(vk.orgId, family);
  } catch (err) {
    logger.error({ err: String(err) }, "provider credential lookup failed");
    return c.json({ error: { message: "credential backend unavailable" } }, 503);
  }
  if (!cred) {
    return c.json({ error: { message: `no enabled ${family} credential configured`, type: "configuration_error" } }, 502);
  }

  const incoming = new URL(c.req.url);
  let prepared;
  try {
    prepared = adapterFor(cred.providerKind).prepare(
      cred,
      { method: c.req.method, pathname: incoming.pathname, search: incoming.search, model, headers: c.req.header(), body: rawBody, stream: false },
      config.upstreams[family],
    );
  } catch (err) {
    logger.error({ err: String(err), providerKind: cred.providerKind }, "adapter prepare failed");
    return c.json({ error: { message: "upstream credential misconfigured", provider: family } }, 502);
  }

  let upstream: Response;
  try {
    upstream = await fetch(prepared.url, { method: c.req.method, headers: prepared.headers, body: prepared.body });
  } catch (err) {
    logger.error({ err: String(err), family }, "passthrough upstream failed");
    return c.json({ error: { message: "upstream request failed", provider: family } }, 502);
  }
  return new Response(upstream.body, { status: upstream.status, headers: stripResponseHeaders(upstream.headers) });
}

export const proxyRoutes = new Hono();

// Anthropic native surface — what Claude Code talks to (ANTHROPIC_BASE_URL).
// count_tokens MUST be registered before /v1/messages is not required (exact
// paths), but it must exist or Claude Code's token-counting calls 404.
proxyRoutes.post("/v1/messages/count_tokens", (c) => passthrough(c, "anthropic"));
proxyRoutes.post("/v1/messages", (c) => forward(c, "anthropic"));

// OpenAI-compatible surface — Codex / OpenAI SDK clients.
proxyRoutes.post("/v1/chat/completions", (c) => forward(c, "openai"));
proxyRoutes.post("/v1/completions", (c) => forward(c, "openai"));
proxyRoutes.post("/v1/embeddings", (c) => forward(c, "openai"));
