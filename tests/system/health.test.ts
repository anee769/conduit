import { test } from "node:test";
import assert from "node:assert/strict";
import { GATEWAY_URL } from "../lib/helpers";

test("GET /health → 200 with version", async () => {
  const res = await fetch(`${GATEWAY_URL}/health`);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.status, "ok");
  assert.ok(j.version, "version is stamped");
});

test("GET /ready → 200 and reports datastore checks", async () => {
  const res = await fetch(`${GATEWAY_URL}/ready`);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ready, true);
  assert.equal(j.checks.postgres, "ok");
  assert.equal(j.checks.clickhouse, "ok");
  assert.equal(j.checks.redis, "ok");
});

test("GET /metrics → Prometheus exposition with our counters", async () => {
  const res = await fetch(`${GATEWAY_URL}/metrics`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /gateway_proxy_requests_total/);
  assert.match(body, /gateway_cost_usd_total/);
  assert.match(body, /gateway_cache_hits_total/);
});
