#!/usr/bin/env bash
# Seed clean demo data for the dashboard / a design-partner walkthrough.
#
#   bash scripts/seed-demo.sh            # wipe + re-seed org, send demo traffic
#   KEEP_DATA=1 bash scripts/seed-demo.sh  # keep existing usage, just add traffic
#
# Requires the stack running (datastores + mock + gateway + control-plane).
# Sends a realistic mix of models, some streaming, and repeated identical
# requests so the cache-savings number is non-zero.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a

CH="http://localhost:8123/?database=finops"
G="http://localhost:4000/v1/messages"

if [ "${KEEP_DATA:-0}" != "1" ]; then
  echo "Wiping demo data (usage_events + organizations)…"
  curl -s "$CH" -u finops:finops --data-binary "TRUNCATE TABLE usage_events" >/dev/null
  docker exec conduit-postgres-1 psql -U finops -d finops -c "TRUNCATE organizations CASCADE;" >/dev/null
fi

OUT="$(pnpm --filter @finops/db exec tsx scripts/admin.ts seed-demo 2>/dev/null)"
VK="$(printf '%s' "$OUT" | grep -oE 'vk_live_[A-Za-z0-9_-]+' | head -1)"
echo "Seeded org. Virtual key: $VK"

# Deterministic model mix (no shell array-index pitfalls).
MODELS="claude-sonnet-4 claude-sonnet-4 claude-sonnet-4 claude-opus-4 claude-haiku-4 claude-haiku-4"

send() { # $1=model $2=stream $3=content
  curl -s -o /dev/null -X POST "$G" \
    -H "x-api-key: $VK" -H "content-type: application/json" \
    -d "{\"model\":\"$1\",\"max_tokens\":80,\"stream\":$2,\"messages\":[{\"role\":\"user\",\"content\":\"$3\"}]}"
}

n=0
for i in $(seq 1 50); do
  # rotate through MODELS deterministically
  set -- $MODELS
  shift $(( i % 6 )) || true
  m="${1:-claude-sonnet-4}"
  stream=$([ $(( i % 3 )) -eq 0 ] && echo true || echo false)
  send "$m" "$stream" "demo task $i $(date +%s%N)"
  n=$((n+1))
done

# Repeated identical requests → exact-match cache hits (non-zero savings).
for i in $(seq 1 8); do
  send "claude-sonnet-4" false "summarize the gateway architecture"
done

# A few requests that carry (fake) secrets → the data-governance panel shows
# real flagged categories on a cold dashboard. Alert mode forwards these; only
# the CATEGORY is recorded, never the value. (Values below are well-known
# documentation placeholders, not live credentials.)
send "claude-sonnet-4" false "deploy using AKIAIOSFODNN7EXAMPLE then restart"
send "claude-sonnet-4" false "here is the token ghp_0123456789abcdefghijklmnopqrstuvwxyz for CI"
send "claude-sonnet-4" false "set api_key = \"swordfish-prod-secret-01\" in the config"
gov=3

# ── Backfill previous days so the spend-over-time chart spans a week ───────
# The gateway always stamps requests "now", so to populate earlier dates we
# insert synthetic usage_events straight into ClickHouse (what the dashboard
# reads) — same org/team as the live traffic, with realistic models, a few
# cache hits, some blocked, and a handful of governance flags, backdated 1–4 days.
ORG_ID=$(docker exec conduit-postgres-1 psql -U finops -d finops -t \
  -c "SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1;" | tr -d ' \n')
TEAM_ID=$(docker exec conduit-postgres-1 psql -U finops -d finops -t \
  -c "SELECT id FROM teams WHERE org_id='$ORG_ID' ORDER BY created_at LIMIT 1;" | tr -d ' \n')

ORG_ID="$ORG_ID" TEAM_ID="$TEAM_ID" python3 - > /tmp/finops-history.jsonl <<'PY'
import json, os, random, uuid, datetime
random.seed(42)
org = os.environ.get("ORG_ID") or None
team = os.environ.get("TEAM_ID") or None
# (provider, model, $in/Mtok, $out/Mtok)
models = [("anthropic","claude-sonnet-4",3,15),
          ("anthropic","claude-opus-4",15,75),
          ("anthropic","claude-haiku-4",0.8,4)]
gov_cats = [["aws_credentials"], ["github_token"], ["generic_secret"]]
counts = {4: 25, 3: 45, 2: 35, 1: 60}   # rows per day-offset → varied bar heights
now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
for off, cnt in counts.items():
    day = now - datetime.timedelta(days=off)
    for _ in range(cnt):
        prov, model, inr, outr = random.choice(models)
        ts = day.replace(hour=random.randint(8, 20), minute=random.randint(0, 59),
                         second=random.randint(0, 59), microsecond=0)
        r = random.random()
        intok, outtok = random.randint(400, 6000), random.randint(50, 1200)
        gflag, gcats = 0, []
        if r < 0.12:                      # cache hit (free)
            status, http, cost, cached, cache_hit = "cache_hit", 200, 0.0, intok, 1
        elif r < 0.16:                    # blocked by a policy
            status, http, cost, cached, cache_hit = "blocked", random.choice([402,403,429]), 0.0, 0, 0
            intok = outtok = 0
        else:                             # success (real spend)
            status, http, cache_hit, cached = "success", 200, 0, 0
            cost = round(intok/1e6*inr + outtok/1e6*outr, 8)
            if r < 0.21:                  # a few flagged for governance
                gflag, gcats = 1, random.choice(gov_cats)
        print(json.dumps(dict(
            event_id=str(uuid.uuid4()), org_id=org, team_id=team, virtual_key_id=None,
            ts=ts.strftime("%Y-%m-%d %H:%M:%S.000"), provider=prov, model=model,
            request_type="chat", status=status, http_status=http,
            input_tokens=intok, output_tokens=outtok, cached_tokens=cached,
            cost_usd=cost, latency_ms=random.randint(300, 2500),
            ttft_ms=random.randint(150, 900), cache_hit=cache_hit,
            error_code=None, request_id=None,
            governance_flagged=gflag, governance_categories=gcats)))
PY

hist=$(wc -l < /tmp/finops-history.jsonl | tr -d ' ')
curl -s "http://localhost:8123/?database=finops&query=INSERT%20INTO%20usage_events%20FORMAT%20JSONEachRow" \
  -u finops:finops --data-binary @/tmp/finops-history.jsonl >/dev/null \
  && echo "Backfilled $hist events across the previous 4 days."

echo "Sent $((n+8+gov)) requests ($gov with governance-flagged secrets). Waiting for meter flush…"
sleep 4
curl -s "http://localhost:3000/api/usage?days=7" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);s=d['summary'];print('requests=%d blocked=%d cost=\$%.5f cacheSaved=\$%.5f govFlagged=%d'%(s['requests'],s['blocked'],s['costUsd'],s['cacheSavingsUsd'],s['governanceFlagged']))" 2>/dev/null || true
