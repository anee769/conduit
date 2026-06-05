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

# Mock upstream.
if ! listening 8787; then
  pnpm --filter @finops/gateway mock >/tmp/finops-mock.log 2>&1 &
  PIDS+=($!)
fi

# Gateway (pointed at the mock).
export UPSTREAM_ANTHROPIC_URL="http://127.0.0.1:8787"
export UPSTREAM_OPENAI_URL="http://127.0.0.1:8787"
if ! listening 4000; then
  pnpm --filter @finops/gateway start >/tmp/finops-gateway.log 2>&1 &
  PIDS+=($!)
fi

# Control plane.
if ! listening 3000; then
  pnpm --filter @finops/control-plane dev >/tmp/finops-cp.log 2>&1 &
  PIDS+=($!)
fi

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
