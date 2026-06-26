# Conduit

**The on-prem control plane for AI coding agents.**
Per-engineer cost attribution · hard budgets · egress governance · context-rot observability · audit-ready exports — all inside your VPC.

[![CI](https://github.com/anee769/conduit/actions/workflows/ci.yml/badge.svg)](https://github.com/anee769/conduit/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Site](https://img.shields.io/badge/site-getconduit.vercel.app-blue)](https://getconduit.vercel.app)

Conduit sits between your AI coding agents (Claude Code, Cursor, Codex, Aider) and whatever provider you already use (Anthropic, OpenAI, Bedrock, Azure — or your existing **LiteLLM** / **Portkey** deployment). One env var to adopt, zero client changes, prompts and completions never stored.

```
[Claude Code / Cursor / Codex]
         │  ANTHROPIC_BASE_URL=https://conduit.yourco.dev
         ▼
[Conduit]  vk_live_… (per-engineer)
         │  metering · budgets · governance · audit · context-rot
         ▼
[LiteLLM / Portkey / direct providers]
         │
         ▼
[Anthropic / OpenAI / Bedrock / Azure]
```

---

## Why

Bedrock / Vertex / Azure private endpoints + no-train BAAs solve the *channel to the vendor*. They don't tell finance who spent the $40k, don't catch secrets at egress, don't give auditors a record, and don't show where context rot is burning your token budget. That's the gap Conduit fills — without ever seeing your prompts.

## What you get

- **Per-engineer / per-key / per-model cost attribution** — the breakdown a shared API key structurally can't produce.
- **Hard budgets + model allow-lists** — fail-closed 402 on overage, clear 403 on disallowed model (never a silent downgrade).
- **Egress governance** — T1 secrets scan (API keys / tokens / private keys) + T2-lite per-org entity allowlist (your customer names, codenames, deal codes). Alert → promote-to-block one category at a time. Records the category, **never the value**.
- **Context-rot panel** — buckets requests by input-token size and surfaces the cost-and-error-rate curve. Conduit measures; we never modify the prompt (that would break Anthropic's prefix cache).
- **Auditor-ready export** — every request as a metadata-only CSV/JSON row.
- **Virtual keys** — engineers hold revocable stand-in keys; the real provider credential is AES-256-GCM-sealed in the gateway and never touches a laptop.

## Quickstart

### Option A — run the signed release (no build, ~30 seconds)

Pulls the latest signed images from GHCR (verifiable via `cosign verify`, see [Security posture](#security-posture)).

```bash
# 1. Get the compose file + env template (no full clone needed)
curl -fsSL https://raw.githubusercontent.com/anee769/conduit/master/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/anee769/conduit/master/.env.example -o .env

# 2. Generate a real master encryption key
sed -i.bak "s|^MASTER_ENCRYPTION_KEY=.*|MASTER_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env && rm .env.bak

# 3. Pull the signed images + start
docker compose --profile app pull
docker compose --profile app up -d

# 4. Run migrations + seed the pricing book (one-time)
docker exec conduit-gateway-1 pnpm --filter @finops/db db:migrate
docker exec conduit-gateway-1 pnpm --filter @finops/db seed-pricing

# → open http://localhost:3000/setup → create org / credential / team / virtual key
```

Pin to a specific release by exporting `GATEWAY_IMAGE` and `CONTROL_PLANE_IMAGE` before `up`:

```bash
export GATEWAY_IMAGE=ghcr.io/anee769/conduit-gateway:v0.1.0
export CONTROL_PLANE_IMAGE=ghcr.io/anee769/conduit-control-plane:v0.1.0
```

### Option B — build from source (~2 minutes, for hacking)

```bash
git clone https://github.com/anee769/conduit && cd conduit
cp .env.example .env
sed -i.bak "s|^MASTER_ENCRYPTION_KEY=.*|MASTER_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env && rm .env.bak

docker compose --profile app up -d --build
docker exec conduit-gateway-1 pnpm --filter @finops/db db:migrate
docker exec conduit-gateway-1 pnpm --filter @finops/db seed-pricing
```

### Point any AI tool at it

```bash
export ANTHROPIC_BASE_URL=http://localhost:4000
export ANTHROPIC_AUTH_TOKEN=vk_live_…       # virtual key from /setup
claude                                       # or cursor / codex / aider
```

Full from-zero walkthrough in [`INSTALL.md`](INSTALL.md).

## Works with what you already run

| You run today | Configure Conduit's upstream as |
|---|---|
| **LiteLLM** (any model, any provider) | `UPSTREAM_ANTHROPIC_URL=http://litellm:4000` → full walkthrough: [`docs/run-with-litellm.md`](docs/run-with-litellm.md) |
| **Portkey** | Point `UPSTREAM_OPENAI_URL` / `UPSTREAM_ANTHROPIC_URL` at your Portkey base URL |
| **Direct Anthropic / OpenAI** | Default — nothing to configure |
| **AWS Bedrock** | Configure a Bedrock credential in `/setup`; Conduit signs requests with SigV4 |
| **Azure OpenAI** | Configure an Azure credential (deployment name + `api-version`) in `/setup` |

## How Conduit compares

| | Conduit | LiteLLM | Portkey | Helicone |
|---|---|---|---|---|
| Open-source license | Apache 2.0 | MIT | Apache 2.0 (gateway) | MIT |
| Runs entirely on-prem / in your VPC | ✅ | ✅ | ✅ (enterprise) | ✅ (self-host) |
| Provider routing + aliasing + fallback | ✅ (any upstream) | ✅ | ✅ | ❌ |
| **Per-engineer cost attribution** (virtual keys with names) | ✅ | partial (master-key shared bills) | ✅ | ✅ (observe-only) |
| **Hard budgets** (fail-closed 402) | ✅ | partial | ✅ | ❌ |
| **Egress governance** (secrets + per-org entity allowlist, alert→block) | ✅ | ❌ | ✅ (guardrails) | ❌ |
| **Audit-ready CSV/JSON export** (metadata-only) | ✅ | ❌ | partial | ✅ |
| **Context-rot observability** (cost-and-error curve by input-token size) | ✅ | ❌ | ❌ | ❌ |
| Prompts / completions **never stored** | ✅ | logs by default | configurable | logs by default |
| Signed releases + CycloneDX SBOM | ✅ | ❌ | ❌ | ❌ |
| Designed to sit on top of others | ✅ | n/a | n/a | n/a |

LiteLLM is excellent at model aliasing and routing — Conduit adds the layer your security and finance teams asked for. Portkey is the closest feature overlap but is closed-source enterprise once you need governance + on-prem. Helicone is observability-only (it tells you where tokens went; it doesn't control where they go).

## Honest about what's NOT here

- **No SOC 2 / HIPAA / ISO certification yet.** Won't claim one we don't have. We design Conduit to support *your* audit and provide the artifacts (SBOM, signed images, security whitepaper, CAIQ-lite). See [`SECURITY.md`](SECURITY.md) for the full posture.
- **No SSO / SAML / RBAC** yet — admin token + dashboard password gate today. On the roadmap when a buyer asks.
- **Bedrock streaming** isn't done (binary AWS event-stream framing). Bedrock non-streaming `/invoke` works.
- **Google Vertex adapter** isn't built.
- **Full ML-driven T2 governance** (entity-type inference) isn't built — only the lite version (operator-pasted entity allowlist). Built against a partner's real traffic, not before.

## Security posture

Conduit runs **entirely in your own cloud** — no vendor in the request path, no phone-home, air-gappable. See [`SECURITY.md`](SECURITY.md) for the whitepaper (data-flow diagram, what's stored, crypto, fail-closed auth, compliance posture, threat model).

- Container images are signed via **Sigstore cosign** (keyless OIDC) and ship with a **CycloneDX SBOM** attestation. Released to `ghcr.io/anee769/conduit-gateway` and `ghcr.io/anee769/conduit-control-plane` on every `v*` git tag (see [`.github/workflows/release.yml`](.github/workflows/release.yml)). Verify any released tag:
  ```bash
  cosign verify ghcr.io/anee769/conduit-gateway:<tag> \
    --certificate-identity-regexp 'https://github.com/anee769/conduit' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com
  ```
- Generate an SBOM locally any time with `bash scripts/sbom.sh`.
- **72 automated tests** run on every PR — including the AWS SigV4 reference vector and a governance privacy invariant (the secret/entity value never appears in stored events).

## Architecture (briefly)

- **`apps/gateway`** — Hono on Node, the hot-path data plane. No build step (tsx). Zero-dep ClickHouse client + ioredis.
- **`apps/control-plane`** — Next.js 15 / React 19 dashboard + admin API + first-run `/setup` wizard.
- **`packages/db`** — Drizzle schema, AES-256-GCM crypto, key hashing, pricing + budgets.
- **Stores:** Postgres (config / identity / budgets / pricing) + ClickHouse (append-only `usage_events`) + Redis (cache + rate limits + live budget counters).

Request lifecycle (`apps/gateway/src/routes/proxy.ts`):

```
auth (vk) → rate limit → model allow-list → budget check
         → governance scan (T1 secrets + T2-lite entities)
         → cache lookup → resolve credential → adapter.prepare()
         → forward + tee stream (client untouched; meter branch in background)
```

## Tests

```bash
bash scripts/run-tests.sh             # full unit + live-system suite (72 tests)
bash scripts/run-tests.sh --unit-only # pure logic, no Docker stack needed
pwsh scripts/run-tests.ps1            # Windows equivalent
```

CI (`.github/workflows/ci.yml`) runs both jobs on every PR — only merge when green.

## Contributing

PRs welcome. Quick path:

```bash
git checkout -b feat/my-change
# …
bash scripts/ci-local.sh              # runs the same checks CI runs
bash scripts/ci-local.sh --fast       # typecheck + unit only, no Docker
git push -u origin feat/my-change
gh pr create --base dev
```

Branch flow: feature → `dev` → `master`. CI must pass before merge.

## License

[Apache License 2.0](LICENSE) — same license as Kubernetes, Terraform, Kafka. Use it commercially, modify it, vendor it; please don't claim Conduit is your own work.

## Links

- Site: [getconduit.vercel.app](https://getconduit.vercel.app)
- Security posture: [`SECURITY.md`](SECURITY.md)
- Run with LiteLLM: [`docs/run-with-litellm.md`](docs/run-with-litellm.md)
- Install guide: [`INSTALL.md`](INSTALL.md)
