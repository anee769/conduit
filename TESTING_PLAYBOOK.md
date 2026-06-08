# Manual Testing Playbook — AI FinOps Gateway

A step-by-step, copy-paste-ready guide for manually verifying every feature of the
gateway. Written for someone running it for the first time — or demonstrating it to
a design partner. Every command is exact. Every expected result is explained.

---

## Before You Start: What Needs to Be Running

The gateway stack has six services. All six must be up before any test will work.

| Service | Port | What It Is |
|---|---|---|
| Postgres | 5432 | Stores org config, teams, virtual keys, credentials |
| ClickHouse | 8123 | Stores every request's usage metrics (tokens, cost, latency) |
| Redis | 6379 | Powers rate limits, spend counters, and the exact-match cache |
| Mock upstream | 8787 | Fake AI provider — returns realistic responses without a real API key |
| Gateway | 4000 | The proxy itself — the thing we built |
| Control-plane | 3000 | The dashboard you see in a browser |

**Start everything — two commands, one terminal:**

```bash
cd ~/Desktop/Conduit

# 1. Start the databases (Postgres + ClickHouse + Redis)
docker compose up -d

# 2. Start the gateway + dashboard (all services, color-coded logs)
pnpm dev
```

`pnpm dev` runs mock upstream (cyan) + gateway pointed at it (green) + dashboard (blue)
in a single terminal. If any service crashes, all stop immediately so you see the error.

To stop everything: `Ctrl+C` once.

**Verify all six are alive:**

```bash
curl -s http://localhost:4000/health | python3 -m json.tool
```

You should see all three datastores as `true`:

```json
{
  "status": "ok",
  "postgres": true,
  "clickhouse": true,
  "redis": true
}
```

If any show `false`, that datastore isn't running. Check `docker compose ps`.

---

## Step 0: Seed a Clean Demo State

This creates a fake company ("Demo Org"), a team ("Engineering"), and a virtual key
you'll use for all tests below. It also sends 58 sample requests so the dashboard
has something to show.

```bash
bash scripts/seed-demo.sh
```

The script prints something like:

```
Seeded org. Virtual key: vk_live_Vz4a_d9YnRKqDleyRnIjeH9HCujAAtj-
Sent 58 requests. Waiting for meter flush…
requests=58 blocked=0 cost=$0.00935 cacheSaved=$0.00128
```

**Copy the virtual key.** Set it in your shell so every command below works:

```bash
export VK="vk_live_PASTE_YOUR_KEY_HERE"
export G="http://localhost:4000"
```

> **Why does a virtual key exist?**
> The whole point of the gateway is that your team members never see the real
> Anthropic/OpenAI API key. They get a *virtual key* instead. The gateway holds
> the real key encrypted in the database. When a request comes in, the gateway:
> (1) validates the virtual key, (2) checks all the policies, (3) swaps in the
> real key before forwarding to Anthropic/OpenAI. The client never touches the
> real credential.

---

## Test 1: Health Checks

**What we're testing:** Is the gateway alive? Can it reach all its datastores?

```bash
# Full health (pings Postgres + ClickHouse + Redis)
curl -s $G/health | python3 -m json.tool

# Readiness (same check, used by load balancers and Kubernetes)
curl -s $G/ready | python3 -m json.tool

# Prometheus metrics (used by Grafana for ops monitoring)
curl -s $G/metrics | grep finops
```

**What you expect to see:**
- `/health` → `{"status":"ok","postgres":true,"clickhouse":true,"redis":true}`
- `/ready` → same format
- `/metrics` → lines like `finops_proxy_requests_total`, `finops_proxy_cost_usd_total`

**Why this matters:** A company running this on-prem will plug their monitoring
system into `/metrics`. If the gateway goes down, their Grafana alert fires.

---

## Test 2: Authentication — The First Line of Defense

**What we're testing:** The gateway must reject every request that doesn't carry a
valid virtual key. This is the security control that keeps a random person from
using your Anthropic account.

### 2a. No key at all → should get 401

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```

**Expected:** `HTTP 401` with body `{"error":{"message":"missing or invalid virtual key","type":"authentication_error"}}`

### 2b. Wrong key → should get 401

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "x-api-key: vk_live_THISISNOTREAL" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```

**Expected:** `HTTP 401` — the key doesn't exist in the database, so it's rejected.

### 2c. Real key → should succeed

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "x-api-key: $VK" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```

**Expected:** `HTTP 200` with a full AI response body.

### 2d. Bearer token format (what Claude Code uses)

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "Authorization: Bearer $VK" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```

**Expected:** `HTTP 200` — both `x-api-key` and `Authorization: Bearer` formats work.
This is important because Claude Code uses the Bearer format.

> **Design note:** Auth fails *closed*. If the Postgres database goes down, the
> gateway returns 503 (unavailable) rather than letting requests through. This is
> intentional — auth is a security control, not just a convenience feature.

---

## Test 3: Streaming (SSE) — Passthrough Integrity

**What we're testing:** When an AI model sends a streaming response (used by Claude
Code and most chat UIs), the gateway must pass every byte through to the client
*untouched*, without buffering. Metering happens in the background — the client
never waits for it.

```bash
curl -N -s -X POST $G/v1/messages \
  -H "x-api-key: $VK" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "max_tokens": 80,
    "stream": true,
    "messages": [{"role": "user", "content": "count to 5"}]
  }'
```

**Expected:** Raw SSE frames streaming to your terminal in real time:

```
event: message_start
data: {"type":"message_start","message":{...}}

event: content_block_start
data: {"type":"content_block_start",...}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"text":"1"},...}

... (more deltas)

event: message_stop
data: {"type":"message_stop"}
```

**Why this matters:** The "time to first token" (TTFT) — how quickly the user sees
the AI start responding — is critical for coding agent UX. The gateway records TTFT
in the background without adding any delay to the stream.

---

## Test 4: Exact-Match Cache — The Cost Savings Engine

**What we're testing:** If two requests are byte-for-byte identical, the gateway
serves the second one from cache (Redis) — no round trip to the AI provider, zero
cost, near-zero latency. This is the foundation of the "caching saved" number on
the dashboard.

```bash
# Define the body once — must be EXACTLY the same both times for a cache hit
BODY='{"model":"claude-sonnet-4","max_tokens":50,"messages":[{"role":"user","content":"what is the capital of France"}]}'

echo "--- First request (should MISS the cache) ---"
curl -s -D - -o /dev/null -X POST $G/v1/messages \
  -H "x-api-key: $VK" -H "content-type: application/json" \
  -d "$BODY" | grep -i "x-finops-cache"

echo ""
echo "--- Second request (should HIT the cache) ---"
curl -s -D - -o /dev/null -X POST $G/v1/messages \
  -H "x-api-key: $VK" -H "content-type: application/json" \
  -d "$BODY" | grep -i "x-finops-cache"
```

**Expected:**

```
--- First request (should MISS the cache) ---
x-finops-cache: miss

--- Second request (should HIT the cache) ---
x-finops-cache: hit
```

### Verify the cache hit appears on the dashboard

Wait 3 seconds for the meter buffer to flush, then check:

```bash
sleep 3
curl -s "http://localhost:3000/api/usage?days=7" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);s=d['summary'];print('cacheSaved=\$%.5f cachedTokens=%d'%(s['cacheSavingsUsd'],s['cachedTokens']))"
```

**Expected:** `cacheSaved=$0.0XXXX cachedTokens=NNN` — non-zero, meaning real money
was saved.

Open `http://localhost:3000` and look at "Caching saved" (green number). In the
"Recent requests" table, the cache hit row shows a blue `cache_hit` pill and `$0`
cost.

> **The business case:** Enterprise coding agents hit the same boilerplate questions
> (explain this function, write a docstring for X) over and over. Each cache hit is
> free. In practice, 20-40% of coding agent traffic is cacheable — this is real
> budget reduction without changing any code.

---

## Test 5: Model Allow-List — No Silent Downgrade

**What we're testing:** A team's virtual key can be restricted to specific models.
If their code tries to use a more expensive model they're not allowed, the gateway
blocks it with 403 — it never silently swaps to a cheaper model or ignores the
restriction.

First, create a restricted key (allowed to use only `claude-haiku-4`):

```bash
# Make sure .env is loaded in your current shell
set -a; . ./.env; set +a

RVK=$(pnpm --filter @finops/db exec tsx scripts/admin.ts seed-restricted 2>/dev/null \
  | grep -oE 'vk_live_[A-Za-z0-9_-]+' | head -1)
echo "Restricted key: $RVK"
```

### 5a. Allowed model → should succeed

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "x-api-key: $RVK" -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```

**Expected:** `HTTP 200` — haiku is on the allow-list.

### 5b. Expensive model → should be blocked

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "x-api-key: $RVK" -H "content-type: application/json" \
  -d '{"model":"claude-opus-4","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'
```

**Expected:** `HTTP 403` with:
```json
{"error":{"message":"model 'claude-opus-4' is not allowed for this key","type":"permission_error"}}
```

> **Why "no silent downgrade" matters:** Some proxies in the market will silently
> swap `claude-opus-4` → `claude-haiku-4` if opus is disallowed. This is dangerous —
> a developer thinks they're getting opus quality and makes decisions based on that
> assumption. We reject and tell the client explicitly. The quality of what the AI
> returns is never touched by the gateway.

---

## Test 6: Per-Key Rate Limiting

**What we're testing:** If a team's key has a requests-per-minute (RPM) cap, the
gateway blocks excess requests with 429 once the limit is hit. This prevents a
runaway coding agent or a stuck retry loop from burning through the budget in
minutes.

The demo key from Step 0 has **no RPM limit** (it's for load-testing the dashboard).
For this test, create a new key with a small RPM cap:

```bash
# Load env (needed for ADMIN_TOKEN if set)
set -a; . ./.env; set +a
ADMIN_H=()
[ -n "${ADMIN_TOKEN:-}" ] && ADMIN_H=(-H "x-admin-token: $ADMIN_TOKEN")

# Get the demo org ID
ORG_ID=$(docker exec conduit-postgres-1 \
  psql -U finops -d finops -t \
  -c "SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1;" \
  | tr -d ' \n')

# Create a key with a 5 RPM cap
RL_KEY=$(curl -s "${ADMIN_H[@]}" -X POST http://localhost:3000/api/admin/keys \
  -H "content-type: application/json" \
  -d "{\"orgId\":\"$ORG_ID\",\"name\":\"rate-limit-test\",\"rateLimitRpm\":5}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['virtualKey'])")
echo "Rate-limited key (5 RPM): $RL_KEY"

# Send 8 rapid requests — 429 kicks in after the 5th
echo "Sending 8 rapid requests (expect 429s after request 5):"
for i in $(seq 1 8); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $G/v1/messages \
    -H "x-api-key: $RL_KEY" -H "content-type: application/json" \
    -d '{"model":"claude-sonnet-4","max_tokens":5,"messages":[{"role":"user","content":"rl"}]}')
  printf "$CODE "
done
echo ""
```

**Expected:** `200 200 200 200 200 429 429 429` — five successes, then blocks.

> **Implementation detail:** The rate limiter uses a fixed 60-second window in
> Redis. It fails *open* — if Redis is unavailable, requests are allowed through
> (we don't want a cache blip to kill a team's coding session; budgets are the
> financial safety net). The counter auto-resets every 60 seconds.

---

## Test 7: Budget Enforcement — Hard Spending Caps

**What we're testing:** If a team or org has a spending budget, the gateway blocks
requests once the cap is reached. This is the "stop the bleeding" feature — if the
monthly AI bill is going to blow past $10,000, you'd rather find out via a 402
error than a surprise invoice.

First, get the org ID from the database:

```bash
ORG_ID=$(docker exec conduit-postgres-1 \
  psql -U finops -d finops -t \
  -c "SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1;" \
  | tr -d ' \n')
echo "Org ID: $ORG_ID"
```

Set a comically tiny budget ($0.00001 = 1/100th of a cent) so we can trigger it
with a single request:

```bash
# Insert a hard monthly budget cap
docker exec conduit-postgres-1 psql -U finops -d finops -c "
  INSERT INTO budgets (id, org_id, name, limit_usd, period_type, action)
  VALUES (gen_random_uuid(), '$ORG_ID', 'Monthly cap', 0.00001, 'monthly', 'block');
"

# Manually push the Redis counter past the limit (simulates already-spent money)
# redis-cli runs inside Docker — use docker exec
docker exec conduit-redis-1 redis-cli set "spend:${ORG_ID}:org:monthly:$(date +%Y-%m)" 0.001
```

**Important:** Budgets are cached in-memory at gateway startup and refreshed every
5 minutes. You must call the reload endpoint so the new budget takes effect
immediately — otherwise requests will get 200 for up to 5 minutes:

```bash
# Force the gateway to re-read all budgets from Postgres right now
# (include x-admin-token if ADMIN_TOKEN is set in .env)
set -a; . ./.env; set +a
GATEWAY_ADMIN_H=()
[ -n "${ADMIN_TOKEN:-}" ] && GATEWAY_ADMIN_H=(-H "x-admin-token: $ADMIN_TOKEN")
curl -s "${GATEWAY_ADMIN_H[@]}" -X POST http://localhost:4000/admin/reload | python3 -m json.tool
```

**Expected:** `{"reloaded":true}`. Now try to make a request:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "x-api-key: $VK" -H "content-type: application/json" \
  -d '{"model":"claude-opus-4","max_tokens":100,"messages":[{"role":"user","content":"tell me something expensive"}]}'
```

**Expected:** `HTTP 402` with:

```json
{
  "error": {
    "message": "budget 'Monthly cap' exceeded for the monthly period ($0.001000 spent / $0.000010 limit)",
    "type": "budget_exceeded"
  }
}
```

**Clean up afterward** (remove the fake budget, reset the counter):

```bash
docker exec conduit-postgres-1 psql -U finops -d finops \
  -c "DELETE FROM budgets WHERE name = 'Monthly cap';"
docker exec conduit-redis-1 redis-cli del "spend:${ORG_ID}:org:monthly:$(date +%Y-%m)"
```

> **Failure mode:** If Redis goes down (can't read the counter), the gateway
> defaults to *allowing* the request (fail-open). A cost control must not take
> coding assistants offline over a Redis blip. The FAIL_MODE env var changes this
> behavior: `FAIL_MODE=closed` will block on Redis errors — for orgs where cost
> control is more important than uptime.

---

## Test 8: Metering & Dashboard — The Core Visibility Feature

**What we're testing:** Every request (success, cache hit, blocked, error) is
recorded in ClickHouse with full metadata: which team, which model, how many
tokens, what it cost, how long it took. The dashboard reads this data live.

### 8a. Check raw analytics API

```bash
sleep 3  # wait for meter buffer to flush (METER_FLUSH_MS=2000)
curl -s "http://localhost:3000/api/usage?days=7" | python3 -m json.tool | head -40
```

**Expected:** A JSON object with `summary`, `byModel`, `byTeam`, `timeseries`, and
`recent` arrays populated with real data from every request you've sent.

### 8b. Open the dashboard

```bash
open http://localhost:3000
```

**What to look at and verify:**

| Section | What it shows | Verify |
|---|---|---|
| **Total spend** | Sum of all `costUsd` across the window | Non-zero if you ran seed-demo.sh |
| **Caching saved** | Green number — savings from cache hits | Non-zero after Test 4 |
| **Tokens** | Total input + output tokens | Should be in the thousands |
| **Blocked** | Count of 429/403/402 responses | Non-zero after Tests 5/6/7 |
| **Spend over time** | Bar chart by day | Blue bars for each day that had traffic |
| **Spend by model** | Table of provider + model + requests + cost | Should show claude-sonnet-4, claude-opus-4, claude-haiku-4 |
| **Spend by team** | Table of team + requests + cost | Should show "Engineering" |
| **Recent requests** | Table of last 25 requests | Rows with `success` (green), `cache_hit` (blue), `blocked` (orange) pills |

### 8c. Privacy verification — confirm no bodies are stored

This is a core promise of the product. The database must only contain metadata
(tokens, costs, latency) — never the actual prompt or AI response text.

```bash
# Check ClickHouse column names — should see NO column named "prompt", "content", or "body"
docker exec conduit-clickhouse-1 \
  clickhouse-client -q "DESCRIBE finops.usage_events" 2>/dev/null \
  | grep -iE "prompt|content|body" \
  || echo "✅ VERIFIED: No prompt/body columns exist — metadata only"
```

**Expected:** The echo line prints (no grep match), confirming bodies are never
stored.

> This is critical for regulated enterprises and GCCs. Their legal and security
> teams need to know that code written by Claude Code never leaves their perimeter
> in a stored form. The gateway sees the body momentarily to extract the model name
> and token count — then discards it.

---

## Test 9: Admin API — Control Plane Operations

**What we're testing:** The control-plane exposes a REST API for provisioning:
creating orgs, teams, credentials, keys, and budgets. In a real deployment, this
is what a team lead or ops engineer calls to onboard a new team.

```bash
A="http://localhost:3000/api/admin"

# If ADMIN_TOKEN is set in .env, include it as a header
set -a; . ./.env; set +a
ADMIN_H=()
[ -n "${ADMIN_TOKEN:-}" ] && ADMIN_H=(-H "x-admin-token: $ADMIN_TOKEN")

# See what orgs exist
# Response shape: {"orgs": [...]}
curl -s "${ADMIN_H[@]}" $A/orgs | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(json.dumps(data.get('orgs', data), indent=2))
"

# See credentials — response shape: {"credentials": [...]}
# The raw API key is NEVER returned — encrypted at rest, masked in API
curl -s "${ADMIN_H[@]}" $A/credentials | python3 -m json.tool

# Confirm API key is never exposed in the response
curl -s "${ADMIN_H[@]}" $A/credentials | python3 -c "
import sys, json
data = json.load(sys.stdin)
creds = data.get('credentials', data)  # unwrap the envelope
for c in creds:
    if 'sk-' in str(c.get('apiKey', '')):
        print('🚨 RAW KEY LEAKED:', c)
    else:
        print('✅ Credential safe:', c.get('displayName'), '— key not in response')
"
```

**Expected:** The credential objects show `displayName`, `provider`, `createdAt`
— but never the actual `apiKey`. Keys are encrypted in Postgres with AES-256-GCM.

> **Note on `ADMIN_TOKEN`:** If `ADMIN_TOKEN` is not set in `.env` (the default
> for local dev), the admin API is open — no header needed. If it is set, every
> admin call must include `-H "x-admin-token: $ADMIN_TOKEN"` or it will get 401.
> The script above handles both cases automatically.

---

## Test 10: Prometheus Metrics — Ops Observability

**What we're testing:** The gateway exports standard Prometheus metrics so any ops
team can wire it into their existing Grafana/Datadog/etc setup without learning
anything new.

```bash
curl -s $G/metrics | grep finops
```

**Expected output includes:**

```
# HELP finops_proxy_requests_total Total proxy requests
finops_proxy_requests_total{provider="anthropic",status="200"} 45
finops_proxy_requests_total{provider="anthropic",status="cache_hit"} 8
finops_proxy_requests_total{provider="anthropic",status="429"} 5

# HELP finops_proxy_cost_usd_total Cumulative cost in USD
finops_proxy_cost_usd_total{provider="anthropic",model="claude-sonnet-4"} 0.00523

# HELP finops_cache_hits_total Cache hits served
finops_cache_hits_total{provider="anthropic"} 8

# HELP finops_cache_savings_usd_total Cost saved by cache hits
finops_cache_savings_usd_total{provider="anthropic",model="claude-sonnet-4"} 0.00128

# HELP finops_rate_limited_total Requests rejected by rate limiter
finops_rate_limited_total{provider="anthropic"} 5
```

The ops team configures Grafana to scrape this endpoint. They get dashboards and
alerts without us building anything custom for their stack.

---

## Test 11: Real Anthropic API (The Pitch Number — MOST IMPORTANT)

**What we're testing:** Everything above used the mock upstream (fake responses,
zero real spend). This test runs a real request against `api.anthropic.com` so you
get a real token count and a real dollar cost in the dashboard.

> ⚠️ This costs real money (fractions of a cent per request). Make sure you have
> a funded Anthropic account before running.

### Step 1: Store your real Anthropic key as an encrypted credential

The key goes into the database — **never into `.env`**. The client (you, or Claude
Code) keeps using the virtual key.

```bash
# Wipe the demo data and re-seed with your real key
set -a; . ./.env; set +a
DEMO_PROVIDER_KEY="sk-ant-YOUR-REAL-KEY-HERE" bash scripts/seed-demo.sh
```

**Copy the new virtual key that's printed.**

### Step 2: Restart pointing at real Anthropic

```bash
# Stop pnpm dev (Ctrl+C), then use the real mode:
pnpm dev:real
```

`pnpm dev:real` starts gateway + dashboard without the mock. The gateway reads
`UPSTREAM_ANTHROPIC_URL=https://api.anthropic.com` from `.env` and forwards to
the real Anthropic API.

### Step 3: Send a real request

```bash
export VK="vk_live_YOUR_NEW_KEY"

curl -s -X POST http://localhost:4000/v1/messages \
  -H "x-api-key: $VK" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "Say hello in one sentence."}]
  }' | python3 -m json.tool
```

**Expected:** A real AI response. Check the dashboard — you'll see actual token
counts and a real cost in the "Recent requests" table.

### Step 4: Point Claude Code at the gateway (the full pitch scenario)

```bash
# In a new terminal, with these env vars set, launch claude:
ANTHROPIC_BASE_URL=http://localhost:4000 \
ANTHROPIC_AUTH_TOKEN="vk_live_YOUR_VIRTUAL_KEY" \
claude
```

Claude Code now routes through the gateway. Every prompt you send appears in the
dashboard with tokens, cost, and latency. This is the live demo.

**What to show a partner:** Open `http://localhost:3000` while actively coding with
Claude Code. They watch requests appear in the "Recent requests" table in real time,
with real dollar costs, attributed to the "Engineering" team.

---

## Test 11.5: Data Governance — Secrets Scan (the security gate)

**What we're testing:** Before a request leaves the perimeter for the provider, the
gateway scans it for secrets (API keys, tokens, private keys). In `alert` mode (the
default) it records the detected **category** and forwards; in `block` mode it rejects
with `451`. The matched secret value is **never** stored — only the category.

```bash
# Send a request containing a (fake) AWS key
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST $G/v1/messages \
  -H "x-api-key: $VK" -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4","max_tokens":20,"messages":[{"role":"user","content":"deploy with AKIAIOSFODNN7EXAMPLE please"}]}'
```

**Expected (alert mode):** `HTTP 200` — the request is forwarded, but flagged. Wait
for the meter flush, then confirm it was recorded with the category (and that the
secret value was NOT stored):

```bash
sleep 3
# The flagged event carries the category…
docker exec conduit-clickhouse-1 clickhouse-client -q \
  "SELECT governance_flagged, governance_categories FROM finops.usage_events WHERE governance_flagged = 1 ORDER BY ts DESC LIMIT 1" 2>/dev/null
# …and the secret value appears NOWHERE in the table.
docker exec conduit-clickhouse-1 clickhouse-client -q \
  "SELECT count() FROM finops.usage_events WHERE position(toString(governance_categories), 'AKIA') > 0" 2>/dev/null \
  && echo "✅ secret value never stored (count above should be 0)"
```

On the dashboard, the **Governance flags** KPI and the **Data governance** panel
show the category and the team — never the value.

**To test block mode:** restart the gateway with `GOVERNANCE_MODE=block` (or set it
in `.env` and `curl -X POST $G/admin/reload`), then re-send — you'll get `HTTP 451`
with `{"error":{"type":"governance_blocked", ...}}` and the request never reaches the provider.

> **Why this is the headline for a security team:** this is the control that lets a
> regulated org approve coding agents at all. And because the gateway runs inside
> their perimeter, the inspection never sends their prompts to a third party — which
> a SaaS proxy cannot promise.

---

## Test 12: Full Automated Suite — The Contract

After all manual testing, run the automated suite as a final sanity check:

```bash
bash scripts/run-tests.sh
```

**Expected:** `49 passing` — 30 unit tests (pure logic, no infra) and 19 system
tests (live end-to-end against the running stack).

> The runner takes full ownership of ports 4000/8787/3000 and starts an isolated,
> mock-backed stack. Don't run `pnpm dev` at the same time — it will reclaim those ports.

This is the bar that must never drop. Every future code change must pass this.

---

## Quick Reference: What Status Code Means What

| HTTP Code | Meaning | Gateway layer |
|---|---|---|
| 200 | Request forwarded, AI responded | Success |
| 401 | Invalid or missing virtual key | Auth layer (step 1) |
| 402 | Hard budget cap exceeded | Budget enforcement (step 3b) |
| 403 | Model not on this key's allow-list | Allow-list (step 3) |
| 429 | Rate limit exceeded (too many req/min) | Rate limiter (step 2b) |
| 451 | Sensitive data detected (governance block mode) | Governance gate (step 3d) |
| 502 | No valid provider credential configured | Credential resolution (step 4) |
| 503 | Auth backend (Postgres) unavailable | Auth layer — fail closed |

## Quick Reference: Response Headers

| Header | Value | Meaning |
|---|---|---|
| `x-finops-cache` | `hit` | Served from cache — zero cost, near-zero latency |
| `x-finops-cache` | `miss` | Forwarded to provider — cost incurred |

---

*Gateway hot path order: auth → rate-limit → allow-list → budget → cache → credential resolve → upstream forward + background meter*
