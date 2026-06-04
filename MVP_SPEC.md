# AI FinOps Gateway — MVP Specification

> **One-line product:** A self-hostable middleware that sits between a company's apps/developers and LLM providers (OpenAI, Anthropic, Azure, Google…) to give **cost visibility, budget enforcement, and governance** over all AI spend — including AI coding assistants writing proprietary code.
>
> **Wedge:** Cost control + governance for **regulated / code-sensitive enterprises** (finance, GCCs). On-prem-capable, cloud-portable. Built by a solo developer.

---

## 0. Guiding principles (decisions that constrain everything)

1. **One language end-to-end → TypeScript.** Solo builder velocity beats raw throughput. The gateway is I/O-bound (95% of wall time is waiting on the provider), so Go/Rust's speed edge is irrelevant at MVP scale. One language = shared types across gateway, API, and frontend.
2. **Dual datastore.** Postgres for config/identity/budgets (OLTP). ClickHouse for usage events/analytics (LLM traces are ~25KB each, 50× a normal log line — they must not live in Postgres).
3. **Privacy-first by default.** The gateway **does not persist prompt or completion bodies** unless explicitly enabled per-policy. It logs *metadata* (tokens, cost, model, latency, who). This is the entire trust pitch for code-sensitive buyers.
4. **Fail-open by default (configurable).** If our metering/DB is down, requests still pass to the provider. We never take down a customer's production. Switchable to fail-closed for hard budget caps.
5. **Containerized from day one.** Same Docker images run our SaaS and a customer's on-prem install. `tenant_id` exists in every table even when single-tenant.
6. **Schema is Phase-2/3-ready now.** Cheap to add columns/tables for budgets, teams, caching today; brutal to retrofit later.

---

## 1. Market context (why these choices)

| Competitor | What they own | Gap we exploit |
|---|---|---|
| **LiteLLM** | OSS proxy, virtual keys, per-team budgets, 100+ providers | No guardrails, no PII redaction, weak FinOps reporting/forecasting |
| **Portkey** | Mature gateway: guardrails, semantic cache, FinOps dashboard (now OSS core) | Generalist; not focused on code-asset governance or on-prem finance |
| **Helicone** | Best-in-class observability, Rust gateway (~50ms overhead) | Observability-led, lighter on enforcement/governance |
| **Cloudflare AI Gateway** | Edge caching, scale | Not deployable on-prem; not a FinOps/governance product |

**Our differentiated position:** *FinOps + governance for proprietary-code-sensitive enterprises, deployable on-prem, covering both API traffic and AI-coding-assistant traffic in one pane.*

Validated demand signals from research: semantic caching cuts cost **30–70%**; **60% of Fortune 500** use AI coding assistants and **38% had a security incident**; budget/runaway-cost control is the #1 cited need.

---

## 2. Scope: what's in / out of the MVP

**In (MVP — "Phase 1 + the one Phase-2 control that matters"):**
- OpenAI-compatible proxy endpoint (drop-in: change base URL only)
- Providers at launch: **OpenAI, Anthropic, Azure OpenAI** (covers Claude Code / Codex / Copilot-style traffic)
- Streaming (SSE) passthrough with token accounting
- **Virtual keys** scoped to team/project (the unit of attribution)
- **Usage metering**: tokens in/out, computed cost, model, latency, virtual key, team
- **Budgets + alerts** (the one enforcement feature): soft alert + hard cap per key/team/month
- **Cost dashboard**: spend by team / model / key / time; top consumers
- Operability: `/health`, `/ready`, `/metrics` (Prometheus), structured JSON logs, version stamping, `support-bundle` export
- Admin auth (single admin org for MVP), RBAC stub

**Explicitly OUT (later phases):**
- Semantic caching (Phase 2 — exact-match cache only in MVP)
- PII redaction / guardrails (Phase 2)
- Smart model routing / auto-downgrade (Phase 3)
- SaaS-seat ingestion (ChatGPT/Claude Desktop seat spend) (Phase 3)
- SSO/SAML, full audit/compliance reporting, multi-org SaaS (Phase 3)

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Client apps / SDKs / Claude Code / Codex / Copilot              │
│   (point base_url at the gateway; OpenAI-compatible)             │
└───────────────────────────┬──────────────────────────────────────┘
                            │  HTTPS (OpenAI-compatible)
                  ┌─────────▼──────────┐
                  │   GATEWAY (Node)   │  Fastify, stateless, horizontally scalable
                  │  • authn virtual key │
                  │  • resolve team/budget│
                  │  • budget check (fail-open)│
                  │  • exact-match cache lookup (Redis)│
                  │  • forward + stream (SSE)│
                  │  • token/cost accounting│
                  │  • emit usage event ──┐│
                  └─────────┬────────────┘│
                            │              │ async (non-blocking)
        ┌───────────────────┼──────────┐   │
        ▼                   ▼          ▼   ▼
   OpenAI / Anthropic / Azure      ┌─────────────┐   ┌──────────────┐
                                    │   Redis     │   │  Event queue │
                                    │ cache + rate│   │ (in-proc buf │
                                    │ + counters  │   │  → batch ins) │
                                    └─────────────┘   └──────┬───────┘
                                                            │
                  ┌──────────────────┐            ┌─────────▼────────┐
                  │  Postgres (OLTP) │            │  ClickHouse      │
                  │  orgs, teams,    │            │  usage_events    │
                  │  vkeys, budgets, │◄──reports──│  (append-only)   │
                  │  provider creds  │            │  rollups/MVs     │
                  └────────┬─────────┘            └──────────────────┘
                          │
                  ┌────────▼─────────┐
                  │  CONTROL PLANE   │  Next.js (App Router): dashboard + admin API
                  │  dashboards,     │  reads ClickHouse (usage) + Postgres (config)
                  │  budget config   │
                  └──────────────────┘
```

**Two deployables, one repo (monorepo):**
- `gateway` — hot path. Must be lean, fast to boot, fail-open. No heavy deps.
- `control-plane` — Next.js app (dashboard UI + admin/config API). Can be heavier.
- Shared `packages/` — types, pricing tables, provider adapters, db clients.

**Why split:** the gateway must stay up and fast even if the dashboard is being redeployed; different scaling profiles.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | Solo velocity, shared types |
| Gateway runtime | **Hono on Node 22** | I/O-bound proxy → throughput irrelevant; Hono's win is **portability** — same code runs on Node (on-prem) and edge/Bun/Lambda (future SaaS) unchanged. Run on **Node, not Bun**, on-prem (Node is trusted in regulated envs; Bun reserved for our own cloud). |
| Control-plane / UI | **Next.js (App Router) + React + Tailwind + shadcn/ui** | One framework for UI + admin API routes; shadcn = owned component code, no lock-in, modern/custom look |
| Charts / analytics UI | **Tremor** (KPI cards, charts, tables) on shadcn/ui | Purpose-built for analytics dashboards, same design language as shadcn. Generate screens with **v0.dev**, refine in code |
| OLTP DB | **PostgreSQL 16** | Config, identity, budgets, credentials |
| Analytics DB | **ClickHouse** | High-volume append-only usage events + fast aggregations |
| Cache / counters / rate limit | **Redis** | Exact-match cache, token-bucket rate limits, live budget counters |
| ORM (Postgres) | **Drizzle** | Type-safe, light, great migrations; no heavy runtime |
| Validation | **Zod** | Shared request/response schemas |
| Auth (MVP) | **Lucia / Auth.js** + argon2 | Email+password admin; SSO later |
| Secrets | **Postgres column encryption (libsodium/age)**; KMS/Vault in prod | Provider API keys encrypted at rest |
| Observability | **Prometheus** metrics + **pino** JSON logs + OpenTelemetry traces | Plugs into customers' existing stacks (on-prem requirement) |
| Packaging | **Docker + docker-compose** (MVP), **Helm chart** (later) | Same images SaaS + on-prem |
| Embeddings (Phase 2 cache) | provider embeddings + **pgvector** or ClickHouse vector | Deferred |

**Single-language risk note:** if the gateway ever becomes CPU-bound (it won't at MVP), the documented escape hatch is to rewrite *only* the hot proxy path in Go/Rust behind the same interface. Don't pre-optimize.

---

## 5. Data model

### 5.1 Postgres (OLTP — config & identity)

Every table carries `org_id` (= tenant). Default single tenant on-prem.

```sql
-- Tenancy root (one row on-prem; many in SaaS)
organizations (
  id              uuid pk,
  name            text,
  plan            text,            -- 'self_hosted' | 'saas_team' | ...
  created_at      timestamptz
)

-- People who log into the control plane
users (
  id              uuid pk,
  org_id          uuid fk,
  email           text unique,
  password_hash   text,
  role            text,            -- 'owner' | 'admin' | 'viewer' (RBAC-ready)
  created_at      timestamptz
)

-- Cost-center unit. ALL attribution rolls up to a team.
teams (
  id              uuid pk,
  org_id          uuid fk,
  name            text,
  cost_center     text,            -- for chargeback/showback
  created_at      timestamptz
)

-- Upstream provider accounts (their real API keys live here, ENCRYPTED)
provider_credentials (
  id              uuid pk,
  org_id          uuid fk,
  provider        text,            -- 'openai' | 'anthropic' | 'azure'
  display_name    text,
  encrypted_key   bytea,           -- sealed; never returned to UI in plaintext
  base_url        text,            -- for azure/self-hosted endpoints
  enabled         boolean,
  created_at      timestamptz
)

-- Virtual keys = what clients actually use. The attribution + control primitive.
virtual_keys (
  id              uuid pk,
  org_id          uuid fk,
  team_id         uuid fk,
  name            text,
  key_prefix      text,            -- shown in UI, e.g. 'vk_live_ab12'
  key_hash        text,            -- argon2/sha256 of full secret
  allowed_models  text[],          -- null = all
  rate_limit_rpm  int,             -- requests/min, null = unlimited
  status          text,            -- 'active' | 'revoked'
  created_at      timestamptz,
  last_used_at    timestamptz
)

-- Budgets attach to a team or a virtual key
budgets (
  id              uuid pk,
  org_id          uuid fk,
  scope_type      text,            -- 'team' | 'virtual_key' | 'org'
  scope_id        uuid,
  period          text,            -- 'monthly' | 'daily'
  limit_usd       numeric(12,4),
  alert_pct       int[],           -- e.g. {50,80,100} → alert thresholds
  hard_cap        boolean,         -- true = block when exceeded (fail-closed for this scope)
  created_at      timestamptz
)

-- Alert delivery config
alert_channels (
  id              uuid pk,
  org_id          uuid fk,
  type            text,            -- 'email' | 'slack' | 'webhook'
  target          text,            -- url / address
  enabled         boolean
)

-- Editable model pricing (so new models don't require a redeploy)
model_pricing (
  id              uuid pk,
  org_id          uuid fk,         -- null = global default, overridable per org
  provider        text,
  model           text,
  input_per_1k    numeric(12,8),
  output_per_1k   numeric(12,8),
  cached_input_per_1k numeric(12,8),
  effective_from  timestamptz
)

-- Append-only audit of admin actions (compliance-ready)
audit_log (
  id              uuid pk,
  org_id          uuid fk,
  actor_user_id   uuid,
  action          text,            -- 'budget.update', 'vkey.revoke', ...
  target          text,
  metadata        jsonb,
  created_at      timestamptz
)
```

### 5.2 ClickHouse (analytics — the high-volume table)

This is the heart of FinOps reporting. **Append-only, no prompt/completion bodies by default.**

```sql
CREATE TABLE usage_events (
  event_id         UUID,
  org_id           UUID,
  team_id          UUID,
  virtual_key_id   UUID,
  ts               DateTime64(3),
  provider         LowCardinality(String),
  model            LowCardinality(String),
  request_type     LowCardinality(String),   -- 'chat' | 'completion' | 'embedding'
  status           LowCardinality(String),   -- 'success' | 'error' | 'blocked' | 'cache_hit'
  http_status      UInt16,
  input_tokens     UInt32,
  output_tokens    UInt32,
  cached_tokens    UInt32,
  cost_usd         Decimal(18,8),
  latency_ms       UInt32,
  ttft_ms          UInt32,                   -- time to first token (streaming)
  cache_hit        UInt8,
  error_code       LowCardinality(String),
  -- OPTIONAL, OFF BY DEFAULT, policy-gated:
  prompt_redacted  String DEFAULT '',
  completion_redacted String DEFAULT '',
  request_id       String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (org_id, team_id, ts);

-- Pre-aggregated rollup for fast dashboards (materialized view)
CREATE MATERIALIZED VIEW usage_daily_mv
ENGINE = SummingMergeTree
ORDER BY (org_id, team_id, model, day) AS
SELECT org_id, team_id, model,
       toDate(ts) AS day,
       count() AS requests,
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
       sum(cost_usd) AS cost_usd
FROM usage_events GROUP BY org_id, team_id, model, day;
```

**Live budget counters** live in **Redis** (not ClickHouse), incremented synchronously per request so the budget check is fast and accurate; ClickHouse is the durable analytical record, reconciled periodically.

---

## 6. The request lifecycle (gateway hot path)

```
1. Receive OpenAI-compatible request + virtual key (Authorization header)
2. authn: hash key → look up virtual_key (cached in Redis, TTL)        [fail-open if Redis down]
3. authz: model allowed? key active?
4. budget check: read Redis counter for scope; if hard_cap exceeded → 429 + block
   (soft over-threshold → allow + queue alert)                        [fail-open on store error]
5. rate limit: token bucket in Redis
6. exact-match cache: hash(model+normalized messages) → Redis GET      [MVP cache]
   - hit → return cached, emit cache_hit event, ZERO upstream cost
7. resolve provider_credential, decrypt key in memory
8. forward to provider; stream SSE chunks straight back to client
9. as stream completes: parse usage (tokens), compute cost from model_pricing
10. increment Redis budget counter; enqueue usage_event (non-blocking)
11. background worker batch-inserts events → ClickHouse
```

Critical rule: **steps 8–11 never block the client response.** Accounting is best-effort and async; correctness is reconciled, not synchronous (except the budget counter increment).

---

## 7. Security design (the trust pitch)

Because buyers run **Claude Code / Codex writing proprietary code through this**, security *is* the product:

1. **No body persistence by default.** Prompts/completions are streamed through and dropped. Only metadata stored. Persisting bodies is an explicit, per-policy, off-by-default opt-in (and even then, redacted).
2. **Provider keys encrypted at rest** (sealed-box / libsodium; KMS or Vault in production). Never returned to the UI in plaintext; only prefix shown.
3. **Virtual keys are revocable, scoped, hashed** (never stored plaintext). Compromise of one key ≠ exposure of the real provider key.
4. **TLS everywhere; mTLS option** for on-prem client→gateway.
5. **Tenant isolation** enforced at query layer (every query scoped by `org_id`); even on-prem keeps the boundary.
6. **Immutable audit log** of admin actions (SOC2/ISO evidence later).
7. **Fail-open is a security *availability* choice**, but hard-cap budgets and key revocation are fail-closed by design.
8. **PII/secret redaction** (Phase 2) for the optional body-logging path — detect API keys/credentials in prompts and block/redact (directly addresses the "trading algo leaked to AI" incident class).
9. **Supply-chain hygiene:** pinned deps, SBOM, minimal base images (distroless), no telemetry phone-home unless opt-in.

---

## 8. Operability (running software you can't see — on-prem)

- `/health`, `/ready` (DB + provider reachability), `/metrics` (Prometheus)
- Structured JSON logs with request IDs, content-redacted
- Version stamped in UI, logs, `/health`, support bundle
- `support-bundle` CLI: redacted logs + config + health + metrics snapshot → zip
- Ship a **Grafana dashboard JSON + Prometheus alert rules** with the product
- Backward-compatible DB migrations from release #1 (customers upgrade on their schedule)
- **Opt-in** operational telemetry only (errors/version/uptime — never usage/prompts)

---

## 9. Build plan & milestones (solo)

> Rough solo estimates assuming part-time-to-full-time; sequence matters more than dates.

| # | Milestone | Deliverable | Est. |
|---|---|---|---|
| M0 | Repo + skeleton | Monorepo, Docker compose (PG+CH+Redis), CI, types pkg | 1 wk |
| M1 | Passthrough proxy | OpenAI-compatible forward to Anthropic/OpenAI/Azure, SSE streaming works, **Claude Code + Codex proven pointable at gateway** (`ANTHROPIC_BASE_URL` / base URL) | 1–2 wk |
| M2 | Identity + vkeys | orgs/teams/vkeys, key auth, encrypted provider creds | 1–2 wk |
| M3 | Metering | token/cost accounting → ClickHouse, async batch insert | 1–2 wk |
| M4 | Dashboard | Next.js: spend by team/model/key/time, top consumers | 2 wk |
| M5 | Budgets + alerts | Redis counters, hard cap, threshold alerts (email/slack) | 1–2 wk |
| M6 | Exact-match cache | Redis cache + cache-hit accounting | ~1 wk |
| M7 | Ops hardening | health/metrics/logs, support-bundle, fail-open switch | 1 wk |
| M8 | Package + docs | docker-compose install, quickstart, design-partner onboarding | 1 wk |

**→ Usable design-partner MVP in ~8–12 weeks of focused solo work.** First customer target: a team inside a regulated org (e.g. a finance/brokerage dev team using AI coding assistants).

**Phase 2 (post-validation):** semantic caching, PII/secret redaction + guardrails, RBAC/SSO, multi-tenant SaaS, audit/compliance reports.
**Phase 3:** smart model routing/auto-downgrade, SaaS-seat (ChatGPT/Claude Desktop) spend ingestion, forecasting, savings analytics.

---

## 10. Locked decisions

1. **Deployment model: on-prem / self-hosted FIRST.** The gateway runs inside the customer's network. Code and provider keys never leave their walls. Cloud-SaaS is the *control-plane/dashboard* later — never the data path for this buyer. Eventual topology: lightweight gateway agent (sidecar/container) near the apps + central dashboard.
2. **Cache key normalization: conservative.** Exact-match only in MVP — normalize whitespace + JSON key order + strip volatile fields (timestamps/request IDs); do NOT normalize semantics (that's the Phase-2 semantic cache). Avoids wrong-answer cache hits, which are unacceptable for code.
3. **Pricing: hybrid by segment** (see §12).
4. **Provider priority: vision-aligned →** (1) **Anthropic** + (2) **OpenAI/Azure OpenAI** at launch (these cover Claude Code / Codex / Copilot — our wedge). Then (3) **AWS Bedrock** (finance buyers standardize on it), (4) **Google Gemini**, (5) **local/Ollama** for air-gapped. Breadth-for-breadth's-sake is not a goal; coding-assistant coverage is.

---

## 11. Coding-assistant savings (Claude Code / Codex / Copilot) — phase mapping

**Enabling fact:** these tools can be pointed at the gateway — Claude Code via `ANTHROPIC_BASE_URL`, Codex/Copilot via an OpenAI-compatible base URL. **M1 must prove this on day one** — if they can't be proxied, the wedge collapses.

**Why they're expensive:** agentic loops re-send huge context (repo, files, tool outputs) on the priciest model, repeatedly. That shape dictates the levers:

| Technique | Mechanism | Realistic saving | Phase |
|---|---|---|---|
| Visibility / attribution | Per-developer, per-repo token burn made visible → behavior changes | 10–20% (behavioral) | **MVP** |
| Per-developer budgets + hard caps | Kill runaway agent loops before they burn the month overnight | spike prevention | **MVP** |
| Model allow-lists | Block/limit most expensive models; force cheaper defaults | variable | **MVP** |
| Exact-match cache | Identical repeated calls (agent retries) return free | small, free | **MVP** |
| **Prompt-cache pass-through** | Ensure provider-side prompt caching is actually used — agents re-send identical system prompt + repo context constantly; cached input ≈10× cheaper | **30–60% on coding** | **Phase 2** |
| Semantic cache | Paraphrased/similar prompts hit cache (embedding cost only) | 30–70% repetitive | **Phase 2** |
| Secret/PII redaction | NOT a cost saver — the governance half that lets security *approve* coding agents at all | enables adoption | **Phase 2** |
| Smart routing / auto-downgrade | Cheap model for simple steps (lint/rename/summarize), expensive only for hard reasoning | 20–40% | **Phase 3** |
| Context pruning / compression | Trim redundant re-sent context before it hits the provider | 10–30% | **Phase 3** |

**Narrative:** *MVP shows them the bleeding → Phase 2 stops it (prompt-cache + semantic cache are the headline coding savings) → Phase 3 optimizes it.* The Phase-2 secret-redaction piece is governance, not cost — but it's what makes a finance security team allow coding agents in the first place.

---

## 12. Pricing model (hybrid by segment)

You sell to two segments, so price each in its native motion. Don't force one model on both.

| Segment | Deployment | Pricing | Notes |
|---|---|---|---|
| **Regulated enterprise** (your wedge: finance, GCCs) | On-prem | **Annual platform license**, tiered by # developers/seats or # virtual keys | Predictable; how finance buys; covers support/SLA. NOT one-time — annual, renewable. |
| **Smaller / less code-sensitive teams** (later) | Managed (control plane) | **Platform fee + usage tier** (by tokens monitored or spend-under-management) | Land-and-expand; scales with their growth. |

**Why not pure usage-based for on-prem:** you can't meter usage you can't see (data never leaves their network). License + seat tiers is the honest model there.
**Optional future lever:** a *savings-share* add-on ("we take X% of measured savings") — powerful pitch but only after Phase 2/3, when you can *prove* savings cleanly. Don't lead with it.
**Rule of thumb:** lead with the value metric the buyer already understands — seats for enterprise, usage for SaaS.

---

## 13. Customer setup & onboarding (on-prem)

Two layers: infra config (devops, once) and business config (in-app wizard).

### A. Infra config — single compose file
- One **`docker-compose.yml`** brings up the whole stack: `gateway`, `control-plane`, `postgres`, `clickhouse`, `redis`.
- Infra settings via **`.env`**: DB/Redis URLs, **master encryption key** (seals provider creds), ports, `FAIL_MODE=open|closed`, TLS cert paths.
- Reproducible, one file redeploys everything. Helm chart later for k8s shops.

### B. Business config — in-app first-run wizard
On first launch the control-plane detects an empty DB and runs a setup checklist (this pattern lifts onboarding completion ~60%):

```
Step 1  Create admin account (owner)
Step 2  Add provider credential   → paste Anthropic/OpenAI key (encrypted on save, never shown again)
Step 3  Create first team          → cost-center label
Step 4  Generate first virtual key → shown ONCE
Step 5  "Point your tools here" — copy-paste snippets:
          # Claude Code
          export ANTHROPIC_BASE_URL=https://your-gateway.internal
          export ANTHROPIC_AUTH_TOKEN=vk_live_xxx
          # Codex / OpenAI-compatible
          export OPENAI_BASE_URL=https://your-gateway.internal/v1
          export OPENAI_API_KEY=vk_live_xxx
Step 6  Live check: "Waiting for first request…" → turns green on first real traffic + first cost shown
```

Step 6 is the **time-to-value moment** — admin sees a real request flow through and a cost appear. That's what sells a design partner.

### Dashboard design approach
- Design **in code**: shadcn/ui (base) + Tremor (analytics). No separate design tool needed for a solo founder.
- Accelerate with **v0.dev** to generate screens from prompts; refine in code. Optionally start from a shadcn/Next.js admin starter to skip boilerplate.
- Design philosophy: "show the data, hide the chrome" — clean, minimal, data-first.

---

*Sources: research compiled May 2026 — see chat for full source links (Portkey/LiteLLM/Helicone comparisons, ClickHouse LLM observability, semantic caching cost studies, AI coding assistant security reports, Hono/Fastify benchmarks, shadcn/Tremor dashboards, self-hosted onboarding UX).*
