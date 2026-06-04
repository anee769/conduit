import { test, before } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, chat, chQuery, waitFor, uniq } from "../lib/helpers";

let token: string;
let vkId: string;
before(async () => {
  const { orgId } = await provision("meter");
  const k = await createKey(orgId);
  token = k.token;
  vkId = k.id;
});

test("a successful request is metered to ClickHouse with tokens + cost", async () => {
  const res = await chat(token, { nonce: uniq() });
  assert.equal(res.status, 200);

  const row = await waitFor(async () => {
    const rows = await chQuery<{ status: string; input_tokens: number; output_tokens: number; cost_usd: number }>(
      `SELECT status, input_tokens, output_tokens, cost_usd FROM usage_events
       WHERE virtual_key_id = '${vkId}' AND status = 'success' LIMIT 1`,
    );
    return rows[0];
  });

  assert.equal(row.status, "success");
  assert.ok(Number(row.input_tokens) > 0, "input tokens recorded");
  assert.ok(Number(row.output_tokens) > 0, "output tokens recorded");
  assert.ok(Number(row.cost_usd) > 0, "cost computed from pricing");
});
