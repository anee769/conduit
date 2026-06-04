# AI FinOps Gateway — Project Context

**One-liner:** Self-hostable middleware between a company's apps / AI coding
assistants and LLM providers (OpenAI, Anthropic, Azure, …) for **cost
visibility, budget enforcement, and governance** over AI spend — including
proprietary code written by Claude Code / Codex / Copilot.

**Wedge:** FinOps + governance for **regulated, code-sensitive enterprises**
(finance, GCCs). On-prem-capable, cloud-portable. Built solo. Full product spec
in [`MVP_SPEC.md`](MVP_SPEC.md) — read it for market context, locked decisions,
data model, pricing, and the §13 onboarding design.

---

## STATUS: Phase-1 MVP feature-complete (M1–M8) + full test suite (37 passing)

| # | Milestone | State |
|---|-----------|-------|
| M0 | Monorepo + docker-compose (PG+CH+Redis) | ✅ |
| M1 | Transparent streaming proxy (SSE) | ✅ |
| M2 | Virtual keys + AES-256-GCM encrypted provider creds | ✅ |
| M3 | Token/cost metering → ClickHouse (+ `model_pricing`) | ✅ |
| M4 | Next.js dashboard (spend by team/model/day, caching savings) | ✅ |
| M5 | Budgets + live enforcement (Redis counters, fail-closed caps, alerts) | ✅ |
| M6 | Exact-match cache + per-key rate limiting | ✅ |
| M7 | Ops hardening (FAIL_MODE, support-bundle, Grafana/Prometheus) | ✅ |
| M8 | Admin REST API + first-run wizard + Docker images/compose | ✅ |

**Phase 2 / 3 are NOT built** — see Roadmap below.

---

## MONOREPO LAYOUT (pnpm workspaces, TypeScript everywhere)

```
apps/
  gateway/           Hono on Node — the hot-path data plane (runs on tsx, no build)
    src/
      index.ts       boot: meter buffer, CH schema, pricing+budget caches, graceful flush
      config.ts      env → { port, failMode, upstreams }
      routes/
        proxy.ts     THE core handler (forward()) — request lifecycle below
        health.ts    /health /ready (pings PG+CH+Redis)
        metrics.ts   Prometheus registry + all counters
        admin.ts     POST /admin/reload (reload pricing+budgets in-mem)
      metering/      clickhouse.ts (zero-dep fetch client), usage.ts (parse Anthropic+OpenAI
                     stream/non-stream), pricing.ts (in-mem price map), buffer.ts (async batch)
      budget/        redis.ts (ioredis), period.ts, enforce.ts (check/recordSpend), alerts.ts
      cache/         key.ts (PURE cache-key, unit-tested), cache.ts (Redis store)
      ratelimit/     ratelimit.ts (fixed-window RPM)
    scripts/         mock-upstream.ts, support-bundle.ts
  control-plane/     Next.js 15 / React 19 — dashboard + admin API + /setup wizard
    app/
      page.tsx       dashboard (KPI cards, charts, budgets panel, tables)
      setup/page.tsx first-run wizard
      api/usage/     consolidated analytics JSON
      api/admin/     orgs|teams|credentials|keys|budgets|setup-status (ADMIN_TOKEN-guarded)
    lib/             clickhouse.ts, usage.ts (aggregations), admin-auth.ts, resolve-org.ts
packages/
  db/                @finops/db — Drizzle schema, crypto, keys, repo, pricing, budgets, migrations
  types/             @finops/types — shared Zod schemas (UsageEvent, enums)
tests/               @finops/tests — node:test via tsx (unit + live system)
ops/                 grafana-dashboard.json, prometheus-alerts.yml
Dockerfile.gateway, Dockerfile.control-plane, docker-compose.yml (datastores + "app" profile)
```

## GATEWAY HOT PATH (apps/gateway/src/routes/proxy.ts `forward()`)

Order is deliberate — a cache hit must never bypass policy:
```
1  auth         extract vk (Bearer / x-api-key) → lookup (fail-CLOSED 503 if DB down) → 401 if invalid/revoked
2  read body, peek model; derive requestType
2b rate limit   per-key RPM (Redis fixed window) → 429        [fail-open]
3  allow-list   model not in vk.allowedModels → 403
3b budget       checkBudgets (Redis counters) → 402            [FAIL_MODE decides on Redis error]
3c cache        exact-match lookup → hit: serve stored body, x-finops-cache:hit, cache_hit event $0, SKIP upstream
4  credential   resolve + decrypt provider key
5  forward      inject real key, fetch upstream, TEE body: client branch streams untouched (SSE-safe),
               meter branch drained in bg → TTFT + usage parsed + cost + UsageEvent enqueued; populates cache on 2xx
```
**Privacy-first:** never logs/stores prompt or completion bodies — metadata only.
**Async metering** (ClickHouse insert) never blocks the client response.

---

## RUN IT

```bash
# 0. infra
docker compose up -d                              # Postgres + ClickHouse + Redis
cp .env.example .env                              # then set a real MASTER_ENCRYPTION_KEY (openssl rand -base64 32)
pnpm install
pnpm --filter @finops/db db:migrate
pnpm --filter @finops/db seed-pricing             # load the model price book

# 1. gateway (against a local mock — no real provider key needed)
pnpm --filter @finops/gateway mock                # mock upstream on :8787
UPSTREAM_ANTHROPIC_URL=http://127.0.0.1:8787 \
UPSTREAM_OPENAI_URL=http://127.0.0.1:8787 \
pnpm --filter @finops/gateway start               # gateway on :4000

# 2. control plane (dashboard + /setup wizard)
pnpm --filter @finops/control-plane dev           # :3000  → open /setup first run

# full stack in containers instead:
docker compose --profile app up --build
```

## TEST

```bash
pnpm --filter @finops/tests test:unit             # 21 pure-logic tests, no infra
pnpm --filter @finops/tests test:system           # 16 live tests (needs stack up)
# or the orchestrated runner (brings the whole stack up first):
pwsh scripts/run-tests.ps1            # Windows
# (on macOS/Linux, replicate run-tests.ps1's steps in bash — see that file)
```

Always run `pnpm -r typecheck` before considering a change done. Add/keep tests
for new behavior — the suite is the contract.

---

## KEY ENV VARS (see .env.example for the full list)

`PORT` `FAIL_MODE=open|closed` `MASTER_ENCRYPTION_KEY` (seals provider creds —
must be a real 32-byte base64 value, the placeholder is rejected) ·
`POSTGRES_URL` `CLICKHOUSE_URL` `REDIS_URL` · `UPSTREAM_ANTHROPIC_URL`
`UPSTREAM_OPENAI_URL` (where the gateway forwards — distinct from the client's
`ANTHROPIC_BASE_URL` which points AT the gateway) · `CACHE_ENABLED` `CACHE_TTL_S`
· `METER_BATCH_SIZE` `METER_FLUSH_MS` · `ALERT_WEBHOOK_URL` · `ADMIN_TOKEN`
(control-plane admin API + gateway /admin/reload; unset = open).

## CONVENTIONS / RULES

- **TypeScript everywhere.** Gateway stays lean (zero heavy deps; ClickHouse +
  cache use plain `fetch`/ioredis). Control-plane can be heavier.
- **Fail-open by default**; auth + known hard-cap overages fail closed.
- **Dual store:** Postgres (config/identity/budgets/pricing) + ClickHouse
  (usage_events, append-only) + Redis (cache, rate limits, live budget counters).
- **Migrations:** edit `packages/db/src/schema.ts` → `pnpm --filter @finops/db
  db:generate` → `db:migrate`. Migrations are append-only/backward-compatible.
- Every table carries `org_id` (tenant) even single-tenant on-prem.
- Don't persist prompt/completion bodies. Ever (without an explicit per-policy opt-in — Phase 2).

---

## KEY PRODUCT DECISIONS (from build Q&A — keep these straight)

- **Cloud-hosted clients & their code (AWS/Azure/GCP):** "on-prem" means *inside
  the customer's perimeter* — when that's a cloud VPC, the gateway deploys there
  (ECS task / K8s pod / sidecar). Code + keys never leave their account; same
  trust pitch, different location. No data-plane SaaS for code-sensitive buyers.
- **AWS Bedrock / Google Vertex:** different auth (SigV4 / OAuth2) than the
  header-injection used for Anthropic/OpenAI/Azure → needs a **provider adapter
  layer** (`apps/gateway/src/adapters/*`), Phase 2. `provider_credentials.base_url`
  already exists. MVP covers Bedrock shops via Anthropic-direct or Azure OpenAI.
- **Response quality is preserved — the gateway is quality-neutral by design:**
  transparent proxy, body never modified, **no silent model downgrade** (a
  disallowed model is a 403, never a swap), exact-match cache only in MVP (no
  wrong-answer risk), semantic cache (Phase 2) is opt-in with per-org similarity
  thresholds (code orgs ~0.99). Overhead target <5ms; metering is async/off the
  hot path; SSE TTFT untouched by the tee.
- **Positioning vs observability tools (e.g. TokenJam, Helicone):** they *tell
  you where tokens went*; we *control where they go*. Observability = OTel,
  observe-only, often single-dev/local, no enforcement. Us = an org-level proxy
  with virtual keys, hard budget caps, rate limits, model allow-lists, and
  credential security. Complementary, not competing. Sound bite: **"observability
  shows you the bleeding; we stop it."**

## ROADMAP (the vision — what's next)

**Phase 2 (post-validation) — "stop the bleeding":** priority order for the wedge:
1. **Prompt-cache pass-through / auto-injection** — auto-insert Anthropic
   `cache_control` breakpoints so agents' repeated system-prompt+repo context
   bills at the cached (~10×-cheaper) rate. THE headline coding saving (30–60%);
   small lift; produces a number to pitch ("cut your Claude Code bill 40%").
2. **Secret/PII redaction + guardrails** — not a cost saver; the governance gate
   that lets a finance security team APPROVE coding agents at all.
3. Semantic cache (embeddings + similarity threshold; 30–70% repetitive; higher
   wrong-hit risk → conservative thresholds, opt-in).
4. RBAC + SSO/SAML; users table + dashboard login (Auth.js) — currently only the
   admin *API* is guarded, the dashboard itself is open.
5. **Bedrock + Vertex adapters** (SigV4 / OAuth) — finance standardizes on
   Bedrock. `provider_credentials.base_url` already exists; needs adapter layer.

**Phase 3:** smart model routing / auto-downgrade (cheap model for simple steps),
context pruning/compression, SaaS-seat (ChatGPT/Claude Desktop) spend ingestion,
forecasting & savings analytics, multi-tenant SaaS.

**Hardening before a design partner self-runs:** actually build+run the Docker
images (compose config is validated but images not yet built), dashboard auth,
clean install doc, wire `run-tests.ps1` into CI.

**Decision log:** Hermes agent evaluated and **dropped** (it's an agent
framework with its own proxy/OpenRouter routing — a potential gateway *user*,
not a dependency). Cost-lever research (prompt-cache, batch API 50%, context
compression, model routing) captured in MVP_SPEC §11.

**Go-to-market:** design-partner pitch (free, for feedback) right after MVP —
that's NOW. Warm prospects researched: **ThoughtSpot** (already blogged about
"FinOps for LLMs" — strongest fit), **SpotDraft** (AI-native CLM, high LLM
spend), **PriceLabs** (lower priority). Commercial pitch comes after Phase 2.
Pricing: annual platform license (seat/vkey tiers) for on-prem enterprise;
platform-fee + usage for managed SaaS later.
