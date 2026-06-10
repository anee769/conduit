#!/usr/bin/env bash
# Full system test runner (macOS / Linux / bash).
#
#   bash scripts/run-tests.sh             # unit + system
#   bash scripts/run-tests.sh --unit-only # unit only (no stack needed)
#
# Brings up datastores, migrates, seeds pricing, starts the mock upstream +
# gateway (pointed at the mock) + control-plane, then runs the test suite.
# Mirrors scripts/run-tests.ps1. Background services it starts are torn down
# on exit.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env into the environment.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# The suite owns its governance posture: tests assert alert-mode behavior
# (AWS key → forwarded + flagged), so an operator's demo .env (e.g. promoted
# block categories) must never leak into the test gateway.
export GOVERNANCE_ENABLED=on GOVERNANCE_MODE=alert GOVERNANCE_BLOCK_CATEGORIES=

if [ "${1:-}" = "--unit-only" ]; then
  pnpm --filter @finops/tests test:unit
  exit $?
fi

# Datastores + schema + pricing.
docker compose up -d >/dev/null
pnpm --filter @finops/db db:migrate >/dev/null
pnpm --filter @finops/db seed-pricing >/dev/null

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

listening() { lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

# Take FULL ownership of the stack ports. We start a fresh, isolated, mock-backed
# stack so the suite never runs against a real-Anthropic gateway (a `pnpm dev:real`
# on :4000 would reject the test credential "sk-test-key" → 401) or a stale mock.
#
# Note: `pnpm dev` runs its services under `concurrently --kill-others-on-fail`,
# so killing ONE of its ports (e.g. :4000) cascades and tears down the others
# (mock :8787, dashboard :3000). We therefore kill all three up front and sleep
# to let any such cascade settle BEFORE starting our own — otherwise a late
# cascade would kill a service we just launched (symptom: ECONNREFUSED 8787).
for port in 4000 8787 3000; do
  if listening "$port"; then
    echo "Reclaiming port :$port for an isolated test stack…"
    lsof -ti TCP:"$port" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  fi
done
sleep 2

# Mock upstream.
pnpm --filter @finops/gateway mock >/tmp/finops-mock.log 2>&1 &
PIDS+=($!)

# Gateway (pointed at the mock).
export UPSTREAM_ANTHROPIC_URL="http://127.0.0.1:8787"
export UPSTREAM_OPENAI_URL="http://127.0.0.1:8787"
pnpm --filter @finops/gateway start >/tmp/finops-gateway.log 2>&1 &
PIDS+=($!)

# Control plane.
pnpm --filter @finops/control-plane dev >/tmp/finops-cp.log 2>&1 &
PIDS+=($!)

# Wait for readiness.
for u in "http://localhost:4000/health" "http://localhost:3000/api/usage"; do
  ok=0
  for _ in $(seq 1 60); do
    if curl -sf "$u" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" -ne 1 ]; then echo "service not ready: $u" >&2; exit 1; fi
done

pnpm --filter @finops/tests test
