# Benchmarks

## Gateway latency overhead

Measures Conduit's own processing overhead — auth, budget check, governance
scan, cache lookup, and proxy — in isolation from provider network time, by
pointing the gateway at a zero-latency local mock upstream and comparing the
full path against a direct-to-mock baseline.

Every request uses a unique body, so it is always a cache **miss** and always
exercises the full forward path.

### Result (reference run)

500 measured requests after 50 warmup, two runs agreeing within 0.1 ms:

| metric | gateway overhead |
| ------ | ---------------- |
| p50    | ~4 ms            |
| p95    | ~5 ms            |
| p99    | ~6 ms            |

Against a real provider, where a response takes seconds, this is well under 0.1%
of total request time.

> This isolates gateway overhead against a local mock. It is **not** a
> throughput/concurrency benchmark (requests are serial) and says nothing about
> cache hit-rate or cost savings, which depend entirely on your workload.

### Reproduce

The gateway must be running (`docker compose --profile app up -d`). All calls
below use the admin API; set `ADMIN_TOKEN` from your `.env`.

```bash
# 1. Start the mock upstream (host port 8899)
node bench/mock-upstream.mjs &

# 2. Create an isolated benchmark org, a credential whose baseUrl points at the
#    mock, and a virtual key under that org. host.docker.internal reaches the
#    host from inside the gateway container.
set -a; . ./.env; set +a
CP=http://localhost:3000

ORG=$(curl -s -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" \
  -X POST $CP/api/admin/orgs -d '{"name":"bench-org"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" \
  -X POST $CP/api/admin/credentials \
  -d "{\"orgId\":\"$ORG\",\"provider\":\"anthropic\",\"displayName\":\"mock\",\"apiKey\":\"sk-mock\",\"baseUrl\":\"http://host.docker.internal:8899\"}"

VK=$(curl -s -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" \
  -X POST $CP/api/admin/keys -d "{\"orgId\":\"$ORG\",\"name\":\"bench-key\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["virtualKey"])')

# 3. Run the benchmark
VK="$VK" node bench/latency.mjs

# 4. Clean up
docker exec conduit-postgres-1 psql -U finops -d finops \
  -c "DELETE FROM organizations WHERE name='bench-org';"
pkill -f mock-upstream.mjs
```

Tunable via env: `N` (measured requests), `WARMUP`, `GATEWAY_URL`, `MOCK_URL`.
