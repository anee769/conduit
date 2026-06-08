# AI FinOps Gateway

[![CI](https://github.com/anee769/conduit/actions/workflows/ci.yml/badge.svg)](https://github.com/anee769/conduit/actions/workflows/ci.yml)

On-prem middleware between a company's apps / AI coding assistants and LLM
providers — for **cost visibility, budget enforcement, and governance** over
LLM spend. See [`MVP_SPEC.md`](MVP_SPEC.md) for the full product spec.

> **Status:** Phase-1 MVP feature-complete (M1–M8) + Phase-2 governance started.
> A virtual-key data plane that **meters** every request (token/cost → ClickHouse,
> off the hot path via a tee'd stream), **enforces** model allow-lists, per-key
> rate limits, and live spend budgets (Redis; hard caps fail closed → 402), serves
> an **exact-match cache** (free repeats), runs a **data-governance secrets scan**
> (detect API keys / tokens / private keys leaving the perimeter — alert or block),
> and ships a **dashboard (password-gated) + admin API + first-run wizard**.
> Privacy-first: metadata only, never prompts/completions — and the governance
> scan records the matched *category* only, never the secret value.

### Milestones
- **M1** transparent streaming proxy · **M2** virtual keys + encrypted creds
- **M3** token/cost metering → ClickHouse (+ `model_pricing`)
- **M4** Next.js dashboard (spend by team/model/day, caching savings)
- **M5** budgets + live enforcement (Redis counters, fail-closed hard caps, threshold alerts)
- **M6** exact-match cache (`x-finops-cache`, `cache_hit` accounting) + per-key rate limiting
- **M7** ops hardening (`FAIL_MODE` switch, `support-bundle`, Grafana + Prometheus in [`ops/`](ops/))
- **M8** admin REST API + first-run setup wizard (`/setup`) + Docker images & compose `app` profile
- **Phase 2 (in progress)** —
  - data-governance T1 secrets scan (alert/block, category-only, `451` on block) + dashboard password gate
  - **per-key/per-model cost attribution** + **exportable audit log** (`/api/audit`, CSV/JSON, metadata-only, gated)
  - **provider adapters** — sit in front of **AWS Bedrock (SigV4)** or **Azure OpenAI** with no client change
  - **governance alert→block feedback loop** — promote categories to block via `GOVERNANCE_BLOCK_CATEGORIES`
  - **Claude Code ready** — `/v1/messages/count_tokens` passthrough (auth, not metered) + `scripts/capture-cost.sh` to snapshot a real session's spend for the pitch

### Run it

**Full from-zero guide: [`INSTALL.md`](INSTALL.md)** (Docker or local dev, ~5 min).

Quick version (all-Docker):
```bash
cp .env.example .env                                   # then set MASTER_ENCRYPTION_KEY (openssl rand -base64 32)
docker compose --profile app up -d --build             # datastores + gateway(:4000) + dashboard(:3000)
docker exec conduit-gateway-1 pnpm --filter @finops/db db:migrate
docker exec conduit-gateway-1 pnpm --filter @finops/db seed-pricing
# → open http://localhost:3000/setup to create org → credential → team → virtual key
```

### Tests
```bash
bash scripts/run-tests.sh             # unit + live system suite (61 tests) — macOS/Linux
bash scripts/run-tests.sh --unit-only # pure-logic units, no stack needed
pwsh scripts/run-tests.ps1            # Windows equivalent
```
The bash runner takes full ownership of ports 4000/8787/3000 and starts an
isolated, mock-backed stack (so it never runs against a real-Anthropic gateway).
Don't run `pnpm dev` simultaneously — the runner will reclaim its ports.

Unit: crypto, key hashing, usage parsing, cache-key normalization, period
buckets, **governance secrets scan**. System (live stack): health/ready/metrics,
auth, allow-list, metering→ClickHouse, cache hit/miss, budget 402, rate-limit 429,
**governance alert + category recording + secret-never-stored**, admin API + key revocation.

## Development flow

Branches: feature work → PR into **`dev`** → PR from `dev` into **`master`**.

- **`master`** is the always-green release branch.
- **`dev`** is the integration branch.
- CI (`.github/workflows/ci.yml`) runs on **every PR** (both hops) and on pushes
  to `dev`/`master`: workspace typecheck + the full 59-test suite against a live,
  mock-backed stack. **Only merge a PR when its CI check is green.**

```bash
git checkout dev && git pull
git checkout -b feat/my-change          # branch off dev
# …commit work…
bash scripts/ci-local.sh                 # run the SAME checks CI runs, before pushing
#   (or: bash scripts/ci-local.sh --fast  → typecheck + unit only, no Docker)
git push -u origin feat/my-change
gh pr create --base dev                   # PR into dev (CI runs)
# after review/green: merge, then promote dev → master:
gh pr create --base master --head dev     # PR into master (CI runs again)
```

> On a free private repo GitHub can't *enforce* "CI must pass before merge"
> (that needs GitHub Pro rulesets). The check is advisory here — discipline is to
> merge only on green. Upgrading unlocks one-command server-side enforcement.

## Stack

- **Gateway** (`apps/gateway`) — Hono on Node, the request data plane.
- **Control plane** (`apps/control-plane`) — Next.js dashboard (built in M4).
- **Shared types** (`packages/types`) — Zod schemas + domain types.
- **Datastores** — Postgres (OLTP), ClickHouse (usage analytics), Redis (cache/limits/counters).
- **Monorepo** — pnpm workspaces.

## Prerequisites

- Node ≥ 22 (Corepack ships with it — used to provide pnpm)
- Docker (for the datastores)

## Quickstart

```bash
# 1. Enable pnpm via Corepack (no global install needed)
corepack enable pnpm

# 2. Install workspace dependencies
pnpm install

# 3. Copy env defaults
cp .env.example .env      # PowerShell: Copy-Item .env.example .env

# 4. Bring up Postgres + ClickHouse + Redis
pnpm compose:up

# 5. Type-check the whole workspace
pnpm typecheck

# 6. Boot the gateway
pnpm dev:gateway
```

Then:

```bash
curl http://localhost:4000/health     # liveness + version
curl http://localhost:4000/ready      # readiness (deps stubbed in M0)
curl http://localhost:4000/metrics    # Prometheus metrics
```

## Try the proxy (no real API key needed)

Run a local mock upstream and point the gateway at it:

```bash
# terminal 1 — mock provider on :8787
pnpm --filter @finops/gateway mock

# terminal 2 — gateway forwarding to the mock
UPSTREAM_ANTHROPIC_URL=http://localhost:8787 \
UPSTREAM_OPENAI_URL=http://localhost:8787 \
pnpm dev:gateway

# terminal 3 — stream a response through the gateway
curl -N -X POST http://localhost:4000/v1/messages \
  -H 'content-type: application/json' -H 'x-api-key: test' \
  -d '{"model":"claude-sonnet-4","stream":true}'
```

## Database & virtual keys (M2)

The gateway now authenticates virtual keys and stores provider credentials
encrypted. Set a real `MASTER_ENCRYPTION_KEY` (`openssl rand -base64 32`) and a
`POSTGRES_URL`, then:

```bash
# Apply the schema (idempotent)
pnpm --filter @finops/db db:migrate

# Seed a demo org + team + (encrypted) Anthropic credential + a virtual key.
# Prints the virtual key token ONCE — copy it.
DEMO_PROVIDER_KEY=<your-real-anthropic-key> pnpm --filter @finops/db seed
```

Then call the gateway with the **virtual key** (not the provider key):

```bash
curl -X POST http://localhost:4000/v1/messages \
  -H 'content-type: application/json' \
  -H 'x-api-key: vk_live_xxxxxxxx' \
  -d '{"model":"claude-sonnet-4","max_tokens":64,"messages":[{"role":"user","content":"hi"}]}'
```

The gateway looks up the key, enforces its model allow-list, decrypts the
stored provider credential, and injects it upstream. Regenerate the schema after
editing `packages/db/src/schema.ts` with `pnpm --filter @finops/db db:generate`.

### Pointing Claude Code at the gateway

Against the real Anthropic API (leave `UPSTREAM_ANTHROPIC_URL` at its default):

```bash
export ANTHROPIC_BASE_URL=http://localhost:4000
export ANTHROPIC_AUTH_TOKEN=<your-anthropic-key>   # forwarded upstream (M1)
```

> In M1 the client's key is passed straight through. From M2, clients use a
> **virtual key** and the real provider credential is stored (encrypted) in the
> gateway instead.

## Layout

```
apps/
  gateway/         Hono data plane (health/metrics in M0)
  control-plane/   Next.js dashboard (placeholder until M4)
packages/
  types/           @finops/types — shared Zod schemas + types
docker-compose.yml Postgres + ClickHouse + Redis
```
