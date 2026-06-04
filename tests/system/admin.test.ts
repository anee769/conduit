import { test } from "node:test";
import assert from "node:assert/strict";
import { provision, createKey, adminGet, adminDelete, chat, uniq } from "../lib/helpers";

test("admin API: setup-status reflects provisioned entities", async () => {
  const { orgId } = await provision("admin");
  await createKey(orgId);
  const status = await adminGet("/api/admin/setup-status");
  assert.equal(status.empty, false);
  assert.equal(status.steps.org, true);
  assert.equal(status.steps.credential, true);
  assert.equal(status.steps.virtualKey, true);
});

test("admin API: credentials list never leaks the secret key", async () => {
  const { orgId } = await provision("admin-cred");
  const { credentials } = await adminGet(`/api/admin/credentials?orgId=${orgId}`);
  assert.ok(credentials.length >= 1);
  for (const c of credentials) {
    assert.ok(!("encryptedKey" in c) && !("apiKey" in c), "no secret material in the response");
    assert.equal(c.provider, "anthropic");
  }
});

test("admin API: revoking a key makes the gateway reject it (401)", async () => {
  const { orgId } = await provision("admin-revoke");
  const { id, token } = await createKey(orgId);

  // Works before revocation.
  const before = await chat(token, { nonce: uniq() });
  assert.equal(before.status, 200);
  await before.text();

  const del = await adminDelete(`/api/admin/keys/${id}`);
  assert.equal(del.status, 200);

  // Rejected after revocation (lookup returns status='revoked').
  const after = await chat(token, { nonce: uniq() });
  assert.equal(after.status, 401);
});
