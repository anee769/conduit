import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSecrets, scanEntities, categoriesOf } from "../../apps/gateway/src/governance/scan";

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

// ── Tier 2-lite: per-org entity allowlist ─────────────────────────────────

test("scanEntities: empty list or empty text → no hits", () => {
  assert.deepEqual(scanEntities("anything", []), []);
  assert.deepEqual(scanEntities("", ["Acme Corp"]), []);
});

test("scanEntities: matches a configured customer name, case-insensitive", () => {
  const hits = scanEntities("renewal terms for acme corp next quarter", ["Acme Corp", "Project Nimbus"]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.category, "org_entity");
});

test("scanEntities: whole-word boundary (no substring match inside other tokens)", () => {
  // "Acme" should NOT match inside "Acmeinator" or "myacmething"
  assert.deepEqual(scanEntities("Acmeinator launched", ["Acme"]), []);
  assert.deepEqual(scanEntities("myacmething", ["Acme"]), []);
  // But should match with punctuation boundaries
  assert.equal(scanEntities("(Acme) wins", ["Acme"]).length, 1);
  assert.equal(scanEntities("about Acme.", ["Acme"]).length, 1);
});

test("scanEntities: skips entries shorter than 3 chars and empty entries", () => {
  assert.deepEqual(scanEntities("a b c IT QA", ["a", "  ", "IT", "QA"]), []);
});

test("scanEntities: regex metacharacters in entity names are escaped (no injection)", () => {
  // "C++" and "deal[2026]" contain regex metacharacters; treat as literal strings.
  const hits = scanEntities("we use C++ on deal[2026]", ["C++", "deal[2026]"]);
  assert.equal(hits.length, 2);
});

test("PRIVACY: scanEntities hits never contain the entity value", () => {
  const name = "Project Nimbus";
  const hits = scanEntities(`pitch for ${name} this week`, [name]);
  const serialized = JSON.stringify(hits);
  assert.ok(!serialized.includes(name), "entity value must never appear in the hit");
  assert.ok(!serialized.toLowerCase().includes(name.toLowerCase()), "case-folded entity value must never appear either");
  // Hits still expose only category + ruleId.
  for (const h of hits) assert.deepEqual(Object.keys(h).sort(), ["category", "ruleId"]);
});

test("scanSecrets + scanEntities combine into a single category set", () => {
  const body = 'leak AKIAIOSFODNN7EXAMPLE in the Project Nimbus repo';
  const all = [...scanSecrets(body), ...scanEntities(body, ["Project Nimbus"])];
  const cats = categoriesOf(all);
  assert.ok(cats.includes("aws_credentials"));
  assert.ok(cats.includes("org_entity"));
});
