import { test, before } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, chat, chQuery, waitFor, uniq } from "../lib/helpers";

let token: string;
let vkId: string;
const nonce = uniq("cache"); // SAME nonce both calls → identical body → cacheable

before(async () => {
  const { orgId } = await provision("cache");
  const k = await createKey(orgId);
  token = k.token;
  vkId = k.id;
});

test("first identical request is a miss, second is a cache hit", async () => {
  const first = await chat(token, { nonce });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("x-finops-cache"), "miss");
  await first.text();

  // Wait until the first response has been written to the cache (async).
  const second = await waitFor(async () => {
    const r = await chat(token, { nonce });
    await r.text();
    return r.headers.get("x-finops-cache") === "hit" ? r : null;
  });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("x-finops-cache"), "hit");
});

test("the cache hit is recorded as a cache_hit event with zero cost", async () => {
  const row = await waitFor(async () => {
    const rows = await chQuery<{ status: string; cost_usd: number; cache_hit: number }>(
      `SELECT status, cost_usd, cache_hit FROM usage_events
       WHERE virtual_key_id = '${vkId}' AND status = 'cache_hit' LIMIT 1`,
    );
    return rows[0];
  });
  assert.equal(row.status, "cache_hit");
  assert.equal(Number(row.cost_usd), 0);
  assert.equal(Number(row.cache_hit), 1);
});
