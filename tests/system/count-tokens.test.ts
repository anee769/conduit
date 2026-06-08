import { test, before } from "node:test";
import assert from "node:assert/strict";
import { GATEWAY_URL, provision, createKey, chQuery, uniq } from "../lib/helpers";

/**
 * Anthropic's /v1/messages/count_tokens is a utility call Claude Code makes
 * frequently. The gateway passes it through (authenticated, real credential
 * injected) but must NOT meter it — otherwise utility calls pollute the spend
 * and attribution numbers.
 */

let orgId: string;
let token: string;
before(async () => {
  ({ orgId } = await provision("counttok"));
  ({ token } = await createKey(orgId));
});

function countTokens(tok: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (tok) headers["x-api-key"] = tok;
  return fetch(`${GATEWAY_URL}/v1/messages/count_tokens`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: "claude-sonnet-4", messages: [{ role: "user", content: `hi ${uniq()}` }] }),
  });
}

test("count_tokens without a key is rejected (auth still enforced)", async () => {
  const r = await countTokens(null);
  assert.equal(r.status, 401);
});

test("count_tokens with a valid key is forwarded but NOT metered", async () => {
  const r = await countTokens(token);
  assert.equal(r.status, 200, "passthrough forwards to upstream");

  // Nothing should be enqueued; give any (non-existent) flush a moment, then
  // confirm this org has zero usage events.
  await new Promise((res) => setTimeout(res, 1500));
  const rows = await chQuery<{ c: string }>(
    `SELECT count() AS c FROM usage_events WHERE org_id = '${orgId}'`,
  );
  assert.equal(Number(rows[0]?.c ?? 0), 0, "count_tokens must not create a usage event");
});
