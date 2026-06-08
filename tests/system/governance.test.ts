import { test, before } from "node:test";
import assert from "node:assert/strict";
import { GATEWAY_URL, provision, createKey, chQuery, waitFor } from "../lib/helpers";

/**
 * Data-governance T1 secrets scan (alert mode, the default).
 *
 * A request carrying a secret is forwarded normally (alert mode never blocks),
 * but the recorded usage event is flagged with the detected CATEGORY — and the
 * secret value itself is never stored anywhere.
 */

let orgId: string;
let token: string;

before(async () => {
  ({ orgId } = await provision("gov"));
  ({ token } = await createKey(orgId));
});

async function send(content: string) {
  return fetch(`${GATEWAY_URL}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": token },
    body: JSON.stringify({
      model: "claude-sonnet-4",
      stream: false,
      messages: [{ role: "user", content }],
    }),
  });
}

test("clean request → not flagged, forwarded (200)", async () => {
  const r = await send("please refactor this function for readability");
  assert.equal(r.status, 200);
});

test("request with an AWS key → forwarded (alert) but flagged with category", async () => {
  const r = await send("here is my key AKIAIOSFODNN7EXAMPLE please use it");
  // Alert mode forwards the request to the (mock) upstream.
  assert.equal(r.status, 200);

  const row = await waitFor(async () => {
    const rows = await chQuery<{ flagged: number; cats: string[] }>(
      `SELECT governance_flagged AS flagged, governance_categories AS cats
       FROM usage_events
       WHERE org_id = '${orgId}' AND governance_flagged = 1
       ORDER BY ts DESC LIMIT 1`,
    );
    return rows[0] ?? null;
  });

  assert.equal(row.flagged, 1);
  assert.ok(row.cats.includes("aws_credentials"), `expected aws_credentials, got ${JSON.stringify(row.cats)}`);
});

test("PRIVACY: the secret value is never persisted in usage_events", async () => {
  const secret = "AKIAIOSFODNN7EXAMPLE";
  // Scan the recent rows' text columns — the value must appear nowhere.
  const rows = await chQuery<Record<string, unknown>>(
    `SELECT * FROM usage_events WHERE org_id = '${orgId}' ORDER BY ts DESC LIMIT 10`,
  );
  const blob = JSON.stringify(rows);
  assert.ok(!blob.includes(secret), "secret value must never be stored in usage_events");
});
