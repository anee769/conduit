#!/usr/bin/env bash
# Seed clean, BELIEVABLE demo data for the dashboard / a design-partner walkthrough.
#
#   bash scripts/seed-demo.sh            # wipe + re-seed org, teams, keys, traffic
#   KEEP_DATA=1 bash scripts/seed-demo.sh  # keep existing usage, just add traffic
#
# Requires the stack running (datastores + mock + gateway + control-plane).
# Paints a realistic org: two teams, five named engineer/service keys with
# distinct spend profiles (one heavy Opus user — the "who's the big spender"
# demo moment), cache savings, and governance flags — across today + 4 days.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a

CH="http://localhost:8123/?database=finops"
G="http://localhost:4000/v1/messages"
CP="http://localhost:3000"

admin() { # $1=path $2=json
  curl -s -X POST "$CP$1" -H "content-type: application/json" \
    ${ADMIN_TOKEN:+-H "x-admin-token: $ADMIN_TOKEN"} -d "$2"
}

if [ "${KEEP_DATA:-0}" != "1" ]; then
  echo "Wiping demo data (usage_events + organizations)…"
  curl -s "$CH" -u finops:finops --data-binary "TRUNCATE TABLE usage_events" >/dev/null
  docker exec conduit-postgres-1 psql -U finops -d finops -c "TRUNCATE organizations CASCADE;" >/dev/null
fi

OUT="$(pnpm --filter @finops/db exec tsx scripts/admin.ts seed-demo 2>/dev/null)"
DEFAULT_VK="$(printf '%s' "$OUT" | grep -oE 'vk_live_[A-Za-z0-9_-]+' | head -1)"
echo "Seeded org. Default key: $DEFAULT_VK"

ORG_ID=$(docker exec conduit-postgres-1 psql -U finops -d finops -t \
  -c "SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1;" | tr -d ' \n')
ENG_ID=$(docker exec conduit-postgres-1 psql -U finops -d finops -t \
  -c "SELECT id FROM teams WHERE org_id='$ORG_ID' ORDER BY created_at LIMIT 1;" | tr -d ' \n')

# Second team + five named keys (engineer · tool, plus a service key).
DATA_ID=$(admin /api/admin/teams "{\"orgId\":\"$ORG_ID\",\"name\":\"Data Platform\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

mkkey() { # $1=name $2=teamId → "id token"
  admin /api/admin/keys "{\"orgId\":\"$ORG_ID\",\"teamId\":\"$2\",\"name\":\"$1\"}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['id'],d['virtualKey'])"
}
read -r K_PRIYA T_PRIYA <<<"$(mkkey 'priya — claude-code' "$ENG_ID")"
read -r K_ARJUN T_ARJUN <<<"$(mkkey 'arjun — cursor' "$ENG_ID")"
read -r K_ROHAN T_ROHAN <<<"$(mkkey 'rohan — claude-code' "$ENG_ID")"
read -r K_SNEHA T_SNEHA <<<"$(mkkey 'sneha — codex' "$DATA_ID")"
read -r K_BATCH T_BATCH <<<"$(mkkey 'ml-batch service' "$DATA_ID")"
echo "Created teams + 5 named keys."

send() { # $1=token $2=model $3=stream $4=content
  curl -s -o /dev/null -X POST "$G" \
    -H "x-api-key: $1" -H "content-type: application/json" \
    -d "{\"model\":\"$2\",\"max_tokens\":80,\"stream\":$3,\"messages\":[{\"role\":\"user\",\"content\":\"$4\"}]}"
}

# Today's live traffic — weighted per engineer (priya heaviest, on Opus).
echo "Sending today's traffic…"
n=0
for i in $(seq 1 18); do send "$T_PRIYA" "claude-opus-4"   $([ $((i % 3)) -eq 0 ] && echo true || echo false) "refactor auth module task $i $(date +%s%N)"; n=$((n+1)); done
for i in $(seq 1 14); do send "$T_ARJUN" "claude-sonnet-4" $([ $((i % 4)) -eq 0 ] && echo true || echo false) "cursor edit pass $i $(date +%s%N)"; n=$((n+1)); done
for i in $(seq 1 9);  do send "$T_ROHAN" "claude-sonnet-4" false "fix flaky integration test $i $(date +%s%N)"; n=$((n+1)); done
for i in $(seq 1 7);  do send "$T_SNEHA" "claude-haiku-4"  false "generate sql for cohort report $i $(date +%s%N)"; n=$((n+1)); done
for i in $(seq 1 6);  do send "$T_BATCH" "claude-haiku-4"  false "classify support ticket batch $i $(date +%s%N)"; n=$((n+1)); done

# Repeated identical requests → exact-match cache hits (non-zero savings).
for i in $(seq 1 8); do send "$T_PRIYA" "claude-sonnet-4" false "summarize the gateway architecture"; done

# Governance demo: fake secrets (documentation placeholders, not live creds).
# aws_credentials is PROMOTED TO BLOCK via .env → those two are rejected with 451.
send "$T_ARJUN" "claude-sonnet-4" false "deploy using AKIAIOSFODNN7EXAMPLE then restart"
send "$T_ROHAN" "claude-sonnet-4" false "creds AKIAIOSFODNN7EXAMPLE for the migration"
# github_token + generic stay alert-mode → forwarded but flagged.
send "$T_ARJUN" "claude-sonnet-4" false "here is the token ghp_0123456789abcdefghijklmnopqrstuvwxyz for CI"
# (single quotes inside the prompt — double quotes would break the JSON body)
send "$T_SNEHA" "claude-sonnet-4" false "set api_key = 'swordfish-prod-secret-01' in the config"
gov=4

# ── Backfill previous days (the gateway stamps "now", so insert directly) ───
KEYJSON=$(python3 - "$K_PRIYA" "$ENG_ID" "$K_ARJUN" "$K_ROHAN" "$K_SNEHA" "$DATA_ID" "$K_BATCH" <<'PY'
import json, sys
a = sys.argv
print(json.dumps([
  # [key_id, team_id, weight, model bias (opus/sonnet/haiku)]
  [a[1], a[2], 0.34, [0.55, 0.40, 0.05]],   # priya — heavy, opus-leaning
  [a[3], a[2], 0.24, [0.10, 0.75, 0.15]],   # arjun — sonnet
  [a[4], a[2], 0.16, [0.05, 0.70, 0.25]],   # rohan
  [a[5], a[6], 0.14, [0.00, 0.30, 0.70]],   # sneha — haiku-leaning
  [a[7], a[6], 0.12, [0.00, 0.10, 0.90]],   # ml-batch — cheap + chatty
]))
PY
)

ORG_ID="$ORG_ID" KEYJSON="$KEYJSON" python3 - > /tmp/finops-history.jsonl <<'PY'
import json, os, random, uuid, datetime
random.seed(42)
org = os.environ["ORG_ID"]
keys = json.loads(os.environ["KEYJSON"])
models = [("anthropic","claude-opus-4",15,75),
          ("anthropic","claude-sonnet-4",3,15),
          ("anthropic","claude-haiku-4",0.8,4)]
gov_cats = [["aws_credentials"], ["github_token"], ["generic_secret"]]
counts = {4: 38, 3: 52, 2: 47, 1: 64, 0: 41}  # rows per day-offset (0 = earlier today)
now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
kweights = [k[2] for k in keys]
for off, cnt in counts.items():
    day = now - datetime.timedelta(days=off)
    for _ in range(cnt):
        key_id, team_id, _w, bias = random.choices(keys, weights=kweights)[0]
        prov, model, inr, outr = random.choices(models, weights=bias)[0]
        ts = day.replace(hour=random.randint(8, 20), minute=random.randint(0, 59),
                         second=random.randint(0, 59), microsecond=0)
        r = random.random()
        intok, outtok = random.randint(400, 6000), random.randint(50, 1200)
        gflag, gcats = 0, []
        if r < 0.11:                      # cache hit (free)
            status, http, cost, cached, cache_hit = "cache_hit", 200, 0.0, intok, 1
        elif r < 0.15:                    # blocked by a policy
            status, http, cost, cached, cache_hit = "blocked", random.choice([402,403,429]), 0.0, 0, 0
            intok = outtok = 0
        else:                             # success (real spend)
            status, http, cache_hit, cached = "success", 200, 0, 0
            cost = round(intok/1e6*inr + outtok/1e6*outr, 8)
            if r < 0.20:                  # a few governance flags
                gflag, gcats = 1, random.choice(gov_cats)
        print(json.dumps(dict(
            event_id=str(uuid.uuid4()), org_id=org, team_id=team_id, virtual_key_id=key_id,
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
  && echo "Backfilled $hist attributed events across the previous 4 days."

echo "Sent $((n+8+gov)) live requests ($gov with secrets — aws_credentials BLOCKED, rest alerted). Waiting for meter flush…"
sleep 4
curl -s "$CP/api/usage?days=7" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);s=d['summary'];print('requests=%d blocked=%d cost=\$%.4f cacheSaved=\$%.4f govFlagged=%d keys=%d'%(s['requests'],s['blocked'],s['costUsd'],s['cacheSavingsUsd'],s['governanceFlagged'],len(d.get('byKey',[]))))" 2>/dev/null || true
