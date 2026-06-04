import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUsage } from "../../apps/gateway/src/metering/usage";

test("anthropic non-stream usage", () => {
  const u = parseUsage("anthropic", "application/json",
    JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 } }));
  assert.deepEqual(u, { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheCreationTokens: 10 });
});

test("anthropic streaming: input from message_start, cumulative output from message_delta", () => {
  const sse =
    `event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":200,"cache_read_input_tokens":40,"cache_creation_input_tokens":0,"output_tokens":1}}}\n\n` +
    `event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":17}}\n\n`;
  const u = parseUsage("anthropic", "text/event-stream", sse);
  assert.deepEqual(u, { inputTokens: 200, outputTokens: 17, cacheReadTokens: 40, cacheCreationTokens: 0 });
});

test("openai non-stream: full-price input excludes cached", () => {
  const u = parseUsage("openai", "application/json",
    JSON.stringify({ usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } } }));
  assert.deepEqual(u, { inputTokens: 100, outputTokens: 30, cacheReadTokens: 20, cacheCreationTokens: 0 });
});

test("openai streaming with include_usage final chunk", () => {
  const sse =
    `data: {"choices":[{"delta":{"content":"Hi"}}],"usage":null}\n\n` +
    `data: {"choices":[],"usage":{"prompt_tokens":80,"completion_tokens":12,"prompt_tokens_details":{"cached_tokens":0}}}\n\n` +
    `data: [DONE]\n\n`;
  const u = parseUsage("openai", "text/event-stream", sse);
  assert.deepEqual(u, { inputTokens: 80, outputTokens: 12, cacheReadTokens: 0, cacheCreationTokens: 0 });
});

test("missing usage degrades to zeros, never throws", () => {
  const u = parseUsage("openai", "text/event-stream", `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n`);
  assert.deepEqual(u, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
});
