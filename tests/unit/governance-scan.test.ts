import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSecrets, categoriesOf } from "../../apps/gateway/src/governance/scan";

test("clean text → no hits", () => {
  assert.deepEqual(scanSecrets("please refactor this function to be more readable"), []);
  assert.deepEqual(scanSecrets(""), []);
});

test("detects an AWS access key id", () => {
  const hits = scanSecrets('use this key AKIAIOSFODNN7EXAMPLE for the upload');
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.category, "aws_credentials");
});

test("detects a private key block", () => {
  const hits = scanSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...");
  assert.ok(hits.some((h) => h.category === "private_key"));
});

test("detects provider api keys (anthropic + openai shapes)", () => {
  assert.ok(scanSecrets("sk-ant-api03-abcDEF1234567890abcDEF12").some((h) => h.category === "provider_api_key"));
  assert.ok(scanSecrets("OPENAI_KEY=sk-abcDEF1234567890abcDEF1234567890abcd").some((h) => h.category === "provider_api_key"));
});

test("detects a github token and a JWT", () => {
  assert.ok(scanSecrets("ghp_" + "a".repeat(36)).some((h) => h.category === "github_token"));
  assert.ok(
    scanSecrets("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123456")
      .some((h) => h.category === "jwt"),
  );
});

test("detects a generic assigned secret", () => {
  assert.ok(scanSecrets('password = "hunter2supersecret"').some((h) => h.category === "generic_secret"));
  assert.ok(scanSecrets('api_key: "ABCD1234EFGH5678"').some((h) => h.category === "generic_secret"));
});

test("PRIVACY: hits never contain the matched value", () => {
  const secret = "AKIAIOSFODNN7EXAMPLE";
  const hits = scanSecrets(`leak ${secret} here`);
  const serialized = JSON.stringify(hits);
  assert.ok(!serialized.includes(secret), "matched value must never appear in the hit");
  // Hits expose only category + ruleId.
  for (const h of hits) assert.deepEqual(Object.keys(h).sort(), ["category", "ruleId"]);
});

test("categoriesOf dedupes and sorts", () => {
  const hits = [
    { category: "jwt", ruleId: "jwt" },
    { category: "aws_credentials", ruleId: "aws_access_key_id" },
    { category: "jwt", ruleId: "jwt2" },
  ];
  assert.deepEqual(categoriesOf(hits), ["aws_credentials", "jwt"]);
});

test("multiple distinct secrets → multiple categories", () => {
  const body = 'AKIAIOSFODNN7EXAMPLE and password = "longenoughsecret"';
  const cats = categoriesOf(scanSecrets(body));
  assert.ok(cats.includes("aws_credentials"));
  assert.ok(cats.includes("generic_secret"));
});
