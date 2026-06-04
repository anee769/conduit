import { test, before } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, chat, uniq } from "../lib/helpers";

let token: string;
before(async () => {
  const { orgId } = await provision("auth");
  ({ token } = await createKey(orgId));
});

test("missing virtual key → 401", async () => {
  const res = await chat(null, { nonce: uniq() });
  assert.equal(res.status, 401);
});

test("bogus virtual key → 401", async () => {
  const res = await chat("vk_live_totally-bogus", { nonce: uniq() });
  assert.equal(res.status, 401);
});

test("valid virtual key → 200 (proxied to upstream)", async () => {
  const res = await chat(token, { nonce: uniq() });
  assert.equal(res.status, 200);
});
