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
  // Flip the FIRST ciphertext char to a guaranteed-different base64 char (if it's
  // "A" use "B", else "A" — always a real change). The previous version replaced
  // the second-to-last char based on the last char, which could pick the same
  // char already there → a no-op tamper → flaky pass.
  const flipped = (ct![0] === "A" ? "B" : "A") + ct!.slice(1);
  assert.notEqual(flipped, ct, "tamper must actually change the ciphertext");
  assert.throws(() => decryptSecret(`${iv}:${tag}:${flipped}`));
});
