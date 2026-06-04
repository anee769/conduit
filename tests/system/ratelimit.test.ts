import { test, before } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, chat, uniq } from "../lib/helpers";

let token: string;
before(async () => {
  const { orgId } = await provision("rate");
  ({ token } = await createKey(orgId, { rateLimitRpm: 3 }));
});

test("requests over the per-key RPM are rejected with 429", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await chat(token, { nonce: uniq() }); // unique bodies → no cache short-circuit
    statuses.push(r.status);
    await r.text();
  }
  const limited = statuses.filter((s) => s === 429).length;
  const ok = statuses.filter((s) => s === 200).length;
  assert.ok(ok >= 3, `at least the first 3 allowed (got ${ok}): ${statuses}`);
  assert.ok(limited >= 1, `some requests rate-limited (got ${limited}): ${statuses}`);
});
