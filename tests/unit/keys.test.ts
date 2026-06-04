import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateVirtualKey, hashKey } from "@finops/db";

test("generated key has the vk_live_ shape and a shown prefix", () => {
  const { token, prefix, hash } = generateVirtualKey();
  assert.match(token, /^vk_live_[A-Za-z0-9_-]{20,}$/);
  assert.ok(token.startsWith(prefix), "prefix is a display slice of the token");
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
});

test("hashKey is deterministic and matches generation", () => {
  const { token, hash } = generateVirtualKey();
  assert.equal(hashKey(token), hash);
  assert.equal(hashKey(token), hashKey(token));
});

test("distinct keys are unique", () => {
  const a = generateVirtualKey();
  const b = generateVirtualKey();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.hash, b.hash);
});
