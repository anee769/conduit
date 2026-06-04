import { test, before } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, chat, uniq } from "../lib/helpers";

let token: string;
before(async () => {
  const { orgId } = await provision("allow");
  ({ token } = await createKey(orgId, { allowedModels: ["claude-haiku-4"] }));
});

test("disallowed model → 403", async () => {
  const res = await chat(token, { model: "claude-sonnet-4", nonce: uniq() });
  assert.equal(res.status, 403);
  const j = await res.json();
  assert.equal(j.error.type, "permission_error");
});

test("allowed model → 200", async () => {
  const res = await chat(token, { model: "claude-haiku-4", nonce: uniq() });
  assert.equal(res.status, 200);
});
