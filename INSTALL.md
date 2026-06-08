# Installing Conduit

A from-zero guide to running Conduit **inside your own environment**. Nothing
leaves your network: the gateway proxies to the LLM providers you already use, and
only metadata (tokens, cost, governance category) is ever stored — never your
prompts or completions.

Two paths:

- **[Path A — Docker (recommended)](#path-a--docker-recommended)** — the whole
  stack in containers. This is how you'd run it in a VPC / on a server.
- **[Path B — Local dev](#path-b--local-dev)** — datastores in Docker, app on
  your machine, for development.

Both take ~5 minutes.

---

## Prerequisites

- **Docker** + Docker Compose (Docker Desktop on Mac/Windows, or Docker Engine on Linux)
- For Path B only: **Node 22+** and **pnpm** (`corepack enable`)
- `openssl` (for generating the encryption key — preinstalled on macOS/Linux)

---

## 1. Configure (both paths)

```bash
git clone <your-conduit-repo> conduit && cd conduit
cp .env.example .env
```

Now generate a **real** master encryption key — this seals provider credentials at
rest. The placeholder in `.env.example` is rejected on boot.

```bash
openssl rand -base64 32
```

Open `.env` and set:

| Variable | What to set |
|---|---|
| `MASTER_ENCRYPTION_KEY` | the `openssl` value above. **Keep it stable** — changing it makes existing encrypted credentials unreadable. |
| `ADMIN_TOKEN` | any long random string (`openssl rand -hex 24`). Guards the admin API + `/admin/reload`. |
| `DASHBOARD_PASSWORD` | a password for the dashboard login. Leave unset to run the dashboard open (fine for local). |
| `DASHBOARD_SECRET` | `openssl rand -hex 24` — salts the login cookie. |
| `UPSTREAM_ANTHROPIC_URL` / `UPSTREAM_OPENAI_URL` | the real provider endpoints (defaults are correct). |
| `GOVERNANCE_ENABLED` / `GOVERNANCE_MODE` | `on` / `alert` to start (detect + forward). Switch to `block` once you trust it. |
| `FAIL_MODE` | `open` (requests pass if metering is down) or `closed` (block when controls can't be evaluated). |

> The datastore URLs in `.env` (`POSTGRES_URL`, `CLICKHOUSE_URL`, `REDIS_URL`)
> already point at the Docker services — no change needed.

---

## Path A — Docker (recommended)

Bring up datastores **and** the app (gateway + dashboard):

```bash
docker compose --profile app up -d --build
```

Run the one-time database setup (migrations + the model price book). These run
inside the gateway container, which already has the right network + env:

```bash
docker exec conduit-gateway-1 pnpm --filter @finops/db db:migrate
docker exec conduit-gateway-1 pnpm --filter @finops/db seed-pricing
```

Verify the stack is healthy:

```bash
curl -s http://localhost:4000/ready
# → {"ready":true,"checks":{"postgres":"ok","clickhouse":"ok","redis":"ok"}}
```

Now jump to **[3. First-run setup](#3-first-run-setup-both-paths)**.

---

## Path B — Local dev

Bring up **only** the datastores:

```bash
docker compose up -d            # postgres + clickhouse + redis
```

Install deps and set up the database:

```bash
pnpm install
pnpm --filter @finops/db db:migrate
pnpm --filter @finops/db seed-pricing
```

Start the gateway and the dashboard in two terminals:

```bash
# terminal 1 — gateway on :4000
pnpm --filter @finops/gateway start

# terminal 2 — dashboard on :3000
pnpm --filter @finops/control-plane dev
```

> **Local testing without a real provider key:** start the mock upstream
> (`pnpm --filter @finops/gateway mock` on :8787) and launch the gateway with
> `UPSTREAM_ANTHROPIC_URL=http://127.0.0.1:8787 UPSTREAM_OPENAI_URL=http://127.0.0.1:8787`
> prefixed. Requests are served by the mock — no spend, no real key needed.

---

## 3. First-run setup (both paths)

Open the setup wizard: **http://localhost:3000/setup**

1. Paste your `ADMIN_TOKEN` (stored in your browser, persists across reloads).
2. Walk the checklist: **organization → provider credential → team → virtual key.**
   - The provider key is encrypted with your master key the moment you save it.
   - The virtual key is shown **once** — copy it.
3. Point your tool at the gateway using the snippet the wizard prints:

```bash
# Claude Code
export ANTHROPIC_BASE_URL=http://your-gateway:4000
export ANTHROPIC_AUTH_TOKEN=vk_live_...

# Codex / OpenAI-compatible
export OPENAI_BASE_URL=http://your-gateway:4000/v1
export OPENAI_API_KEY=vk_live_...
```

Make one request. The wizard's "First request seen" turns green, and it appears on
the dashboard at **http://localhost:3000** (spend by team/model/day, cache savings,
governance flags).

---

## 4. Verify it's working (optional smoke test)

```bash
VK=vk_live_...   # your virtual key
curl -s -X POST http://localhost:4000/v1/messages \
  -H "x-api-key: $VK" -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4","max_tokens":50,
       "messages":[{"role":"user","content":"hello from conduit"}]}'
```

You should get a normal provider response. Within a couple of seconds the request
shows up on the dashboard. To see the **governance** scan in action, send a request
whose body contains a (placeholder) secret like `AKIAIOSFODNN7EXAMPLE` — in `alert`
mode it forwards and records the category (`aws_credentials`); in `block` mode it's
rejected with a 451 before it ever reaches the provider. **Only the category is
recorded — never the secret value.**

---

## Common issues

| Symptom | Fix |
|---|---|
| Boot fails: "MASTER_ENCRYPTION_KEY is the placeholder" | Set a real `openssl rand -base64 32` value in `.env`. |
| `/ready` shows a store as not `ok` | `docker compose ps` — wait for the datastore to be `healthy`, then retry. |
| 401 on every request | The virtual key is wrong/revoked, or you're missing the `x-api-key` / `ANTHROPIC_AUTH_TOKEN`. |
| 403 on a model | That model isn't in the virtual key's allow-list (by design — no silent downgrade). |
| Admin API returns 401 | Send `x-admin-token: <ADMIN_TOKEN>` (or `Authorization: Bearer <ADMIN_TOKEN>`). |
| Dashboard redirects to `/login` | `DASHBOARD_PASSWORD` is set — log in, or unset it for open access. |

---

## What's running

| Service | Port | Purpose |
|---|---|---|
| gateway | 4000 | the proxy / data plane — point your tools here |
| control-plane | 3000 | dashboard + admin API + `/setup` wizard |
| postgres | 5432 | config, identity, budgets, pricing |
| clickhouse | 8123 | usage events (append-only, metadata only) |
| redis | 6379 | cache, rate limits, live budget counters |

To stop everything: `docker compose --profile app down`
(add `-v` to also wipe the datastore volumes).
