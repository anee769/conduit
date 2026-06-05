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

echo "Sent $((n+8)) requests. Waiting for meter flush…"
sleep 4
curl -s "http://localhost:3000/api/usage?days=7" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);s=d['summary'];print('requests=%d blocked=%d cost=\$%.5f cacheSaved=\$%.5f'%(s['requests'],s['blocked'],s['costUsd'],s['cacheSavingsUsd']))" 2>/dev/null || true
