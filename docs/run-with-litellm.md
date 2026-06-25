# Running Conduit in front of LiteLLM

> Conduit gives a LiteLLM deployment the **internal control plane** a vendor
> contract doesn't: per-engineer spend attribution, hard budgets, egress
> governance, audit-ready exports, context-rot observability. LiteLLM stays the
> routing / model-aliasing layer. Conduit is the layer your CISO and CFO ask
> about.

This is a 5-minute walkthrough that brings up Conduit + LiteLLM together and
sends a request all the way through. No client changes — point your tools'
`ANTHROPIC_BASE_URL` (or OpenAI base URL) at Conduit, and you keep using LiteLLM
exactly as before.

```
[Claude Code / Cursor / Codex]
        │
        ▼
[Conduit]  ── vk_live_… (per-engineer)
        │   metering · budgets · governance · audit
        ▼
[LiteLLM]  ── master key
        │   routing · aliases · fallbacks
        ▼
[Anthropic / OpenAI / Bedrock / Azure]
```

---

## Prerequisites

- Docker + Docker Compose
- A real provider API key (Anthropic or OpenAI) — the rest of the walkthrough
  assumes `ANTHROPIC_API_KEY`

## 1. Put your provider key + a LiteLLM master key in `.env`

Add to `.env` at the repo root:

```bash
# Real provider key (LiteLLM forwards to the real Anthropic on the gateway's behalf).
ANTHROPIC_API_KEY=sk-ant-...

# A new shared secret that Conduit uses to talk to LiteLLM. Generate one:
#   openssl rand -base64 32
LITELLM_MASTER_KEY=sk-litellm-master-key-change-me
```

If you're going to forward OpenAI traffic too, also set `OPENAI_API_KEY`.

## 2. Bring up the stack with the LiteLLM sidecar

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.litellm.yml \
  --profile app \
  up --build
```

This starts the usual Conduit stack (Postgres + ClickHouse + Redis + gateway +
control-plane) **plus a LiteLLM sidecar** on container hostname `litellm:4000`
(host port `4001`, so it doesn't clash with the Conduit gateway on `4000`).

Sanity-check that LiteLLM is up:

```bash
curl http://localhost:4001/health/liveliness
# → "I'm alive!"
```

## 3. Point Conduit's upstream at LiteLLM

In `.env`:

```bash
UPSTREAM_ANTHROPIC_URL=http://litellm:4000
UPSTREAM_OPENAI_URL=http://litellm:4000
```

Restart the gateway container so it picks up the new values:

```bash
docker compose restart gateway
```

## 4. Configure the LiteLLM credential in Conduit

Open `http://localhost:3000/setup` (or use the admin API). Create a provider
credential:

| Field      | Value                                                  |
|------------|--------------------------------------------------------|
| Provider   | `anthropic` (or `openai` if you'll forward OpenAI too) |
| Secret     | the `LITELLM_MASTER_KEY` from step 1                   |
| Base URL   | leave blank — `UPSTREAM_*` already sets it             |

Conduit treats LiteLLM as the upstream provider; the master key is its bearer
credential. The real Anthropic / OpenAI key never leaves the LiteLLM container.

## 5. Issue a virtual key + send a request

In the setup wizard or via the admin API, create a team + virtual key.

Now point any AI tool at Conduit:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4000
export ANTHROPIC_AUTH_TOKEN=vk_live_…       # the virtual key
claude
```

(Or for an `OPENAI_BASE_URL` client: `export OPENAI_BASE_URL=http://localhost:4000/v1`.)

What you should see in Conduit's dashboard at `http://localhost:3000`:

- The request appears in **Activity** within seconds (metadata only — no body).
- Spend is **attributed to the virtual key** (per-engineer, per-model, per-day).
- The **Governance** tab shows any policy hits — categories only, never the value.
- The **Context** tab buckets the request by input-token size and contributes
  to the cost-and-error-rate curve.

## What Conduit adds that LiteLLM alone doesn't

| | LiteLLM alone | LiteLLM behind Conduit |
|---|---|---|
| Per-engineer / per-key spend attribution | Limited (master-key-shared bills) | **Yes** — one virtual key per engineer / service, full breakdown |
| Hard budgets with fail-closed enforcement | Partial | **Yes** — org / team / key, daily / monthly, 402 on hit |
| Egress governance (secrets + per-org entity allowlist) | No | **Yes** — alert → promote-to-block, value never stored |
| Auditor-ready metadata-only event log + CSV/JSON export | No | **Yes** — `/api/audit` |
| Context-rot observability (per-bucket cost / latency / error rate) | No | **Yes** — `Context` tab |
| Prompt / completion bodies never stored | LiteLLM logs requests by default | **Yes** — metadata only, verified by test |
| Signed releases + CycloneDX SBOM | No | **Yes** — cosign keyless OIDC |

LiteLLM stays excellent at what it's excellent at: model aliasing, routing,
fallbacks, the broad provider matrix. Conduit adds the layer your security and
finance teams asked for.

## Troubleshooting

**`HTTP 401 from LiteLLM`** — the master key Conduit is sending doesn't match
LiteLLM's. Re-check `LITELLM_MASTER_KEY` matches both the `.env` value and the
provider-credential `secret` in Conduit.

**`Connection refused: litellm:4000`** — Docker's container DNS only resolves
within the compose network. Make sure both the gateway and LiteLLM services
are in the same compose project (using both `-f` flags as in step 2).

**`Model not found` from LiteLLM** — the model name your client sends has to
match one of the `model_name` entries in
[`examples/litellm/litellm-config.yaml`](../examples/litellm/litellm-config.yaml).
Add the alias there, then `docker compose restart litellm`.

**Streaming hangs or 400s** — Bedrock streaming has a known limitation (binary
AWS event-stream framing). Direct Anthropic / OpenAI streaming through LiteLLM
works. If you see a streaming hang at Bedrock specifically, route via LiteLLM
to direct Anthropic for now.

---

## Why this combo is a good fit

LiteLLM solves "I want one API surface for many providers." Conduit solves
"my security team will not approve AI coding agents without an internal
control plane." Different problems, different layers, complementary scope.
Run one without the other and you have half a solution; run them together
and the regulated-eng story is complete.
