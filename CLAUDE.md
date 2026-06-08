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

## STATUS: Phase-1 MVP (M1–M8) + Phase-2 governance started · full test suite (59 passing)

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
| P2.1 | Data-governance T1 secrets scan (alert/block, category-only) + dashboard auth | ✅ |
| P2.2 | Per-key/per-model cost attribution + exportable audit log (CSV/JSON) | ✅ |
| P2.3 | Provider adapters: Bedrock (SigV4) + Azure OpenAI; sit in front of either | ✅ |
| P2.4 | Governance alert→block feedback loop (per-category promote, `GOVERNANCE_BLOCK_CATEGORIES`) | ✅ |

**Contextual T2 governance (per-org entities) + Phase 3 are NOT built** — see
Roadmap. T2 is deliberately deferred until a design partner's real traffic. Bedrock
support is non-streaming (`/invoke`); Bedrock *streaming* (event-stream framing) is
the next adapter increment.

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
        admin.ts     POST /admin/reload (reload pricing+budgets+governance in-mem)
      metering/      clickhouse.ts (zero-dep fetch client), usage.ts (parse Anthropic+OpenAI
                     stream/non-stream), pricing.ts (in-mem price map), buffer.ts (async batch)
      budget/        redis.ts (ioredis), period.ts, enforce.ts (check/recordSpend), alerts.ts
      cache/         key.ts (PURE cache-key, unit-tested), cache.ts (Redis store)
      ratelimit/     ratelimit.ts (fixed-window RPM)
      governance/    scan.ts (PURE T1 secrets scanner, unit-tested — category only, never
                     the value), policy.ts (env-driven alert|block + per-category
                     promote-to-block via effectiveAction(); hot-reloadable)
      adapters/      provider layer: types.ts (Adapter iface), anthropic|openai|azure|
                     bedrock.ts, sigv4.ts (PURE AWS SigV4, unit-tested vs AWS vector),
                     index.ts (registry + resolveCredential: prefer Bedrock/Azure if configured)
    scripts/         mock-upstream.ts, support-bundle.ts
  control-plane/     Next.js 15 / React 19 — dashboard + admin API + /setup wizard
    app/
      page.tsx       dashboard (KPI cards, charts, budgets panel, tables)
      setup/page.tsx first-run wizard
      login/page.tsx dashboard password gate (when DASHBOARD_PASSWORD set)
      api/usage/     consolidated analytics JSON (incl. governance aggregations)
      api/admin/     orgs|teams|credentials|keys|budgets|setup-status (ADMIN_TOKEN-guarded)
      api/login/     validates DASHBOARD_PASSWORD → sets hashed cookie
    middleware.ts    dashboard auth gate (protects UI routes, excludes /api/*)
    lib/             clickhouse.ts, usage.ts (aggregations + getGovernance), admin-auth.ts,
                     dashboard-auth.ts (cookie token), resolve-org.ts
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
3d governance   scanSecrets(body) → alert: record category + forward · block: 451 before upstream
               [PURE scan; category recorded, NEVER the value; sync — the only added latency, opt-in]
3c cache        exact-match lookup → hit: serve stored body, x-finops-cache:hit, cache_hit event $0, SKIP upstream
4  credential   resolveCredential(orgId, family) → prefers Bedrock/Azure if configured, else direct; decrypt
5  forward      adapterFor(kind).prepare() builds URL+auth (+Bedrock body rewrite/SigV4); bedrock streaming → 400.
               fetch upstream, TEE body: client branch streams untouched (SSE-safe), meter branch drained in bg →
               TTFT + usage parsed + cost + UsageEvent enqueued; populates cache on 2xx. Meter provider = family
               (azure meters as openai, bedrock as anthropic) so the rest of the path never branches on provider.
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
(control-plane admin API + gateway /admin/reload; unset = open) ·
`GOVERNANCE_ENABLED=on|off` `GOVERNANCE_MODE=alert|block` (T1 secrets scan)
`GOVERNANCE_BLOCK_CATEGORIES` (csv — categories promoted to block while global mode
stays alert: the feedback loop) · `AWS_REGION` `AZURE_OPENAI_API_VERSION` (provider
adapters) · `DASHBOARD_PASSWORD` `DASHBOARD_SECRET` (dashboard UI gate; unset = open).

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
- **AWS Bedrock / Azure OpenAI: BUILT (`apps/gateway/src/adapters/*`).** The
  adapter layer abstracts the per-provider URL/auth/body shaping. `resolveCredential`
  prefers a Bedrock/Azure credential over the direct API when the org configures one
  → an org "becomes a Bedrock/Azure shop" with no client change (the wedge: *sit in
  front of* their Bedrock). Bedrock = SigV4-signed `/invoke` (non-streaming; the org
  stores `secret="accessKeyId:secretAccessKey"`, `baseUrl=region|endpoint`). Azure =
  `api-key` header + deployment path + `api-version`. Credentials are still encrypted
  via `provider_credentials.encryptedKey`. **Not yet:** Bedrock *streaming* (binary
  AWS event-stream framing the SSE tee can't parse → streaming Bedrock returns 400),
  and Google Vertex (OAuth2) — both LATER. Quality-neutral promise holds: only
  Bedrock rewrites the body (drops `model`, adds `anthropic_version`), and only
  because its API requires it.
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

**Strategic reframe (2026-06): GOVERNANCE is the wedge, not cost.** Stress-tested
against the "who can do this without a gateway?" test: every cost lever (prompt
caching, batch, context optimization) is provider- or client-side and DIY-able —
table-stakes, not a moat. The defensible half (budgets, allow-lists, credential
security, **contextual governance**) requires an unbypassable org-level chokepoint.
Governance is the ONE thing both impossible without a gateway AND impossible from a
SaaS gateway (data can't leave the perimeter to be inspected) → an on-prem proxy is
the only place it can run. Harness now ships a competing gateway (on-prem too) →
cost parity is assumed; governance + perimeter is the differentiation.

**Field-research re-cut (2026-06, see `MARKET_SIGNALS.md`):** ~20 regulated
practitioners on Reddit converged on a sharper truth. **The perimeter is now
table-stakes too** — the consensus answer is "Bedrock/Vertex/Azure private endpoint
+ no-train contract/BAA," which secures the *channel to the vendor*. So Conduit
stops leading with "data never leaves your perimeter" and leads with the half
nobody solved: **the internal control plane** (per-user/per-model attribution,
budgets, egress governance, audit) that cloud-hosted models + contracts leave
empty. Bedrock/Azure become **substrate we sit in front of, not competitors.** Two
validated GTM hooks: *governed AI vs shadow AI* (bans → personal accounts w/ prod
code) and *time-to-yes* ("compliance signed off faster because governance was built
in, not bolted on"). A direct competitor (Reddit "DurthVadr") independently landed
on the same architecture and validated **"classify the request, not the code"** +
alert→promote-to-block as how governance actually ships.

**NOW — design-partner-ready core (finish/polish):**
1. ✅ **T1 secrets scan (DONE)** — `governance/scan.ts` (pure, unit-tested) at hot-path
   step 3d; alert (record category + forward, sub-ms sync) or block (451). Category
   recorded, NEVER the value. Dashboard panel + `gateway_governance_flags_total`.
2. ✅ **Dashboard password gate (DONE)** — `DASHBOARD_PASSWORD` + middleware.
3. ✅ **Per-key / per-model cost attribution (DONE)** — "the second fire is finance."
   `getByKey()` joins ClickHouse spend to virtual-key name/prefix/team; surfaced as
   "Spend by virtual key" + in `/api/usage`. The breakdown a shared key can't give.
4. ✅ **Exportable audit log (DONE)** — `/api/audit?days=&format=csv|json`, auditor-
   ready, metadata-only, gated (dashboard cookie OR admin token). Export buttons on
   the Activity tab. The artifact that makes a security review short.
5. 🔨 **Hardening gates** — ✅ Docker images built + smoke-tested, ✅ clean install
   doc (`INSTALL.md`); REMAINING: wire `run-tests.sh` into CI, capture one real
   before/after cost number.

**NEXT — "sit in front of Bedrock" + governance-that-ships:**
6. ✅ **Bedrock + Azure OpenAI adapters (DONE)** — `apps/gateway/src/adapters/*`.
   Azure (api-key + deployment path + api-version, byte-transparent, streaming-OK)
   and Bedrock (SigV4-signed `/invoke`, body rewrite; streaming → 400 for now).
   `resolveCredential` prefers Bedrock/Azure when configured → "put Conduit in front
   of your Bedrock" with no client change. SigV4 unit-tested vs the AWS vector.
7. ✅ **Governance feedback loop (DONE)** — per-category promote-to-block via
   `GOVERNANCE_BLOCK_CATEGORIES` + `effectiveAction()`; global mode stays alert while
   you promote high-confidence categories one at a time. Dashboard shows each
   category as blocking vs alerting. The FP-aware loop, env-driven + hot-reloadable.
8. **T2 contextual governance** — per-org entities (customer names, codenames,
   revenue). "Classify the request, not the code." Build AGAINST a design partner's
   real traffic, alert-only first, then promote-to-block. NOT before a partner.

**LATER:** Bedrock *streaming* (AWS event-stream framing); Google Vertex adapter
(OAuth2); RBAC + SSO/SAML (Auth.js — when a buyer's review demands it); prompt-cache
pass-through (preserve client `cache_control` first — a convenience + dashboard
number, NOT a moat); semantic cache (opt-in, conservative).

**Phase 3 / FRONTIER (watch, don't build):** **agent-action audit** — not just
*that* data left but *what the agent touched/decided* and the reasoning chain
(the next-hardest unsolved problem once egress is covered; long-term
differentiator). Also: smart model routing, SaaS-seat spend ingestion,
forecasting, multi-tenant SaaS. **NOT** self-hosted inference (we proxy frontier
models — validated repeatedly) and **NOT** context pruning at the gateway — it
breaks prompt caching (needs a byte-identical prefix), risks context rot, and
violates the quality-neutral promise. Context optimization belongs in the client/agent.

**Hardening before a design partner self-runs:** actually build+run the Docker
images (compose config is validated but images not yet built), clean install doc,
wire the test runner into CI, capture one real before/after cost number.

**Decision log:** Hermes agent **dropped** (agent framework, a potential gateway
*user* not a dependency). Cost-lever research captured in MVP_SPEC §11. Key
finding (arxiv 2601.06007 + Chroma context-rot): prompt caching and context pruning
CONFLICT — pruning invalidates the cache prefix; and context rot means relevant-only
context beats full context, so optimization belongs client-side, never at the proxy.

**Go-to-market:** design-partner pitch (free, for feedback) right after MVP —
that's NOW. Warm prospects researched: **ThoughtSpot** (already blogged about
"FinOps for LLMs" — strongest fit), **SpotDraft** (AI-native CLM, high LLM
spend), **PriceLabs** (lower priority). Commercial pitch comes after Phase 2.
Pricing: annual platform license (seat/vkey tiers) for on-prem enterprise;
platform-fee + usage for managed SaaS later.

**Design-partner sourcing (don't single-thread on one warm intro):** run a small
outbound pipeline of 15–20 qualified targets in parallel; expect a low hit rate, so
volume matters. ICP filter (from `MARKET_SIGNALS.md`): regulated/code-sensitive,
50–500 eng, $20k+/mo LLM spend OR actively wrestling the approval problem, runs in
own cloud, AND a leak that *can't* be blame-shifted (rules out orgs treating a BAA
as liability transfer). Sourcing channels: (1) the Reddit thread itself — DM the
genuine practitioners who described the exact pain (lifelong1250 shared-IAM-role,
Mr_Cromer infosec, Gesha24 no-metric) — warmest leads available, they self-
identified; (2) Indian fintech under RBI localization (Groww, Razorpay, Zerodha,
Jupiter, CRED) via founder/eng-leader warm intros; (3) GCCs in finance/healthcare;
(4) YC/Indian-startup directories filtered for AI-native + regulated-data;
(5) LinkedIn search on "Head of Platform/Security/DevEx" at fintech/healthtech.
Pitch is feedback-first, free 60–90 days in their VPC, not a sale. Target: 3–5
serious conversations, land 1–2 partners.
