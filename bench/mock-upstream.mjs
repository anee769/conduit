import http from "node:http";
// Minimal mock of the Anthropic messages endpoint: returns instantly with a
// valid-shaped response so we measure GATEWAY overhead, not provider network time.
const body = JSON.stringify({
  id: "msg_mock", type: "message", role: "assistant", model: "claude-haiku-4-5",
  content: [{ type: "text", text: "ok" }],
  usage: { input_tokens: 10, output_tokens: 2 },
});
const server = http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
});
server.listen(8899, "0.0.0.0", () => console.log("mock upstream on :8899"));
