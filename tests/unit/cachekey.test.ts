import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKeyFor, canonical } from "../../apps/gateway/src/cache/key";

const buf = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer;

test("key is invariant to whitespace and key order", () => {
  const a = new TextEncoder().encode('{"model":"m","messages":[{"role":"user","content":"hi"}]}').buffer as ArrayBuffer;
  const b = new TextEncoder().encode('{\n  "messages": [ { "content": "hi", "role": "user" } ],\n  "model": "m"\n}').buffer as ArrayBuffer;
  assert.equal(cacheKeyFor("anthropic", "/v1/messages", a), cacheKeyFor("anthropic", "/v1/messages", b));
});

test("different model → different key", () => {
  const a = cacheKeyFor("anthropic", "/v1/messages", buf({ model: "haiku", messages: [] }));
  const b = cacheKeyFor("anthropic", "/v1/messages", buf({ model: "sonnet", messages: [] }));
  assert.notEqual(a, b);
});

test("different provider or path → different key", () => {
  const body = buf({ model: "m", messages: [] });
  assert.notEqual(cacheKeyFor("anthropic", "/v1/messages", body), cacheKeyFor("openai", "/v1/messages", body));
  assert.notEqual(cacheKeyFor("openai", "/v1/chat/completions", body), cacheKeyFor("openai", "/v1/completions", body));
});

test("volatile fields (request_id) do not affect the key", () => {
  const a = cacheKeyFor("anthropic", "/v1/messages", buf({ model: "m", request_id: "abc", messages: [] }));
  const b = cacheKeyFor("anthropic", "/v1/messages", buf({ model: "m", request_id: "zzz", messages: [] }));
  assert.equal(a, b);
});

test("non-JSON or empty body → null (uncacheable)", () => {
  assert.equal(cacheKeyFor("anthropic", "/v1/messages", new TextEncoder().encode("not json").buffer as ArrayBuffer), null);
  assert.equal(cacheKeyFor("anthropic", "/v1/messages", new ArrayBuffer(0)), null);
});

test("canonical sorts nested keys deterministically", () => {
  assert.equal(JSON.stringify(canonical({ b: 1, a: { d: 2, c: 3 } })), JSON.stringify({ a: { c: 3, d: 2 }, b: 1 }));
});
