#!/usr/bin/env bash
# Snapshot a real session's spend into a shareable artifact (for the pitch).
#
#   bash scripts/capture-cost.sh            # snapshot the last 1 day
#   DAYS=7 bash scripts/capture-cost.sh     # snapshot a wider window
#
# Writes cost-capture-<timestamp>/ containing:
#   SUMMARY.md  — human-readable totals, by-model, by-virtual-key
#   usage.json  — the raw /api/usage payload
#   audit.csv   — the metadata-only audit export (who/when/model/tokens/cost)
#
# Conduit is a transparent proxy — it does NOT lower your raw token price. The
# artifact proves VISIBILITY + ATTRIBUTION + GOVERNANCE (what a provider invoice
# can't give you), plus cache savings where exact repeats occurred.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; [ -f .env ] && . ./.env; set +a

DAYS="${DAYS:-1}"
CONTROL="${CONTROL_URL:-http://localhost:3000}"
OUT="cost-capture-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

curl -s "${CONTROL}/api/usage?days=${DAYS}" > "$OUT/usage.json"
curl -s "${CONTROL}/api/audit?days=${DAYS}&format=csv" \
  -H "x-admin-token: ${ADMIN_TOKEN:-}" > "$OUT/audit.csv" || true

python3 - "$OUT/usage.json" "$DAYS" > "$OUT/SUMMARY.md" <<'PY'
import sys, json
data = json.load(open(sys.argv[1])); days = sys.argv[2]
s = data["summary"]
print(f"""# Conduit — real session capture (last {days}d)

| Metric | Value |
|---|---|
| Requests | {s['requests']:,} |
| Total spend | ${s['costUsd']:.4f} |
| Input tokens | {s['inputTokens']:,} |
| Output tokens | {s['outputTokens']:,} |
| Cache savings | ${s['cacheSavingsUsd']:.4f} |
| Governance flags | {s['governanceFlagged']} |

## By model""")
for m in data.get("byModel", []):
    print(f"- **{m['model']}** — {m['requests']:,} req · ${m['costUsd']:.4f}")
print("\n## By virtual key (per-engineer / per-service attribution)")
for k in data.get("byKey", []):
    print(f"- **{k['keyName']}** ({k.get('keyPrefix') or '—'}) — {k['requests']:,} req · ${k['costUsd']:.4f}")
gov = data.get("governance", {})
if gov.get("byCategory"):
    print("\n## Governance — sensitive data caught before it left the perimeter")
    for c in gov["byCategory"]:
        print(f"- {c['category'].replace('_',' ')}: {c['requests']} ({c.get('enforced','alert')})")
print("\n> Conduit is a transparent proxy — it does not lower the raw token price. "
      "This is the visibility, attribution, and governance a shared provider key gives you zero of.")
PY

echo "wrote: $OUT/SUMMARY.md  $OUT/usage.json  $OUT/audit.csv"
echo
cat "$OUT/SUMMARY.md"
