/**
 * Mock LLM upstream for local development and verifying the proxy.
 * Mimics enough of Anthropic's /v1/messages (streaming + non-streaming) to
 * exercise the gateway without a real provider key or external network.
 *
 *   pnpm --filter @finops/gateway mock
 *
 * Then point the gateway at it:
 *   UPSTREAM_ANTHROPIC_URL=http://localhost:8787
 *
 * Request body knobs (JSON):
 *   { "stream": true }  → SSE response
 *   { "fail": true }    → 429 error (to test status passthrough)
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT ?? 8787);

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed: { model?: string; stream?: boolean; fail?: boolean } = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      /* ignore */
    }

    // Reflect what we received so the proxy's header/body handling can be asserted.
    const authValue = String(
      req.headers["x-api-key"] ?? req.headers["authorization"] ?? "none",
    );
    res.setHeader("x-mock-saw-auth", authValue === "none" ? "no" : "yes");
    res.setHeader("x-mock-auth-value", authValue); // proves which key reached upstream
    res.setHeader("x-mock-model", parsed.model ?? "none");

    if (parsed.fail) {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rate limited (mock)" } }));
      return;
    }

    if (parsed.stream) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const events = [
        `event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12,"cache_read_input_tokens":8,"cache_creation_input_tokens":0,"output_tokens":1}}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":" world"}}\n\n`,
        `event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":9}}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ];
      let i = 0;
      const tick = () => {
        if (i < events.length) {
          res.write(events[i++]);
          setTimeout(tick, 50);
        } else {
          res.end();
        }
      };
      tick();
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "msg_mock",
        model: parsed.model ?? "mock-model",
        content: [{ type: "text", text: "Hello world" }],
        usage: { input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 },
      }),
    );
  });
});

// Bind IPv4 explicitly: a default `::` bind is IPv6-only on Windows, which makes
// Node's undici `fetch` to 127.0.0.1 fail intermittently.
server.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`mock upstream listening on http://127.0.0.1:${port}`);
});
