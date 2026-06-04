// Provider-credential sealing roundtrip. Set a key BEFORE importing the module.
process.env.MASTER_ENCRYPTION_KEY ??= "dGVzdC1rZXktMzItYnl0ZXMtZm9yLXVuaXQtdGVzdHM=";

import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "@finops/db";

test("encrypt → decrypt round-trips", () => {
  const secret = "sk-ant-super-secret-provider-key";
  const sealed = encryptSecret(secret);
  assert.notEqual(sealed, secret, "ciphertext must not equal plaintext");
  assert.match(sealed, /^[^:]+:[^:]+:[^:]+$/, "iv:tag:ciphertext format");
  assert.equal(decryptSecret(sealed), secret);
});

test("ciphertext is non-deterministic (random IV)", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("tampered ciphertext fails to decrypt (GCM auth)", () => {
  const sealed = encryptSecret("hello");
  const [iv, tag, ct] = sealed.split(":");
  const flipped = ct!.slice(0, -2) + (ct!.endsWith("A") ? "B" : "A") + ct!.slice(-1);
  assert.throws(() => decryptSecret(`${iv}:${tag}:${flipped}`));
});
