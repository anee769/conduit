import { test, before } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, createBudget, reloadGateway, chat, waitFor, uniq } from "../lib/helpers";

let token: string;
before(async () => {
  const { orgId } = await provision("budget");
  ({ token } = await createKey(orgId));
  // Tiny hard cap: one request's cost exceeds it.
  await createBudget(orgId, 0.00001, "block");
  await reloadGateway(); // make the new budget take effect immediately
});

test("requests are blocked with 402 once the hard cap is exceeded", async () => {
  // First request goes through (counter starts at 0) and records spend.
  const first = await chat(token, { nonce: uniq() });
  assert.equal(first.status, 200);

  // Subsequent requests trip the cap once the async spend lands.
  const blocked = await waitFor(async () => {
    const r = await chat(token, { nonce: uniq() });
    return r.status === 402 ? r : null;
  }, 8000);

  const j = await blocked.json();
  assert.equal(j.error.type, "budget_exceeded");
});
