#!/usr/bin/env bash
# Run the SAME checks CI runs — locally, before you push.
#
#   bash scripts/ci-local.sh            # full: install + typecheck + unit + system
#   bash scripts/ci-local.sh --fast     # skip install + system (typecheck + unit only)
#
# Mirrors .github/workflows/ci.yml so a green run here means a green run there.
# Requires Docker running (for the system suite's datastores).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

if [ "$FAST" -eq 0 ]; then
  step "install (frozen lockfile)"
  pnpm install --frozen-lockfile
fi

step "typecheck (all workspace packages)"
pnpm -r typecheck

if [ "$FAST" -eq 1 ]; then
  step "unit tests only (--fast)"
  pnpm --filter @finops/tests test:unit
  printf '\n\033[1;32m✅ ci-local --fast passed (typecheck + unit).\033[0m\n'
  exit 0
fi

step "unit + system suite (live mock-backed stack)"
bash scripts/run-tests.sh

printf '\n\033[1;32m✅ ci-local passed — safe to push.\033[0m\n'
