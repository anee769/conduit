/**
 * Gateway latency-overhead benchmark.
 *
 * Measures Conduit's *own* processing overhead — auth + budget check +
 * governance scan + cache lookup + proxy — in isolation from provider network
 * time. It does this by pointing the gateway at a zero-latency local mock
 * upstream (bench/mock-upstream.mjs) and comparing:
 *
 *     client -> gateway -> mock      (full Conduit path)
 *     client -> mock                 (baseline)
 *
 * The difference is the overhead Conduit adds. Every request uses a unique body
 * so it is always a cache MISS and always exercises the full forward path (a
 * cache hit would measure the cache, not the overhead).
 *
 * Usage:
 *   1. Start the mock:     node bench/mock-upstream.mjs
 *   2. Create a benchmark org + a credential whose baseUrl points at the mock
 *      (http://host.docker.internal:8899 when the gateway runs in Docker) and a
 *      virtual key under that org — see bench/README.md for the exact curl calls.
 *   3. VK=vk_live_... node bench/latency.mjs
 */

const VK = process.env.VK;
const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:4000/v1/messages";
const MOCK = process.env.MOCK_URL ?? "http://localhost:8899/v1/messages";
const N = Number(process.env.N ?? 500);
const WARMUP = Number(process.env.WARMUP ?? 50);

if (!VK) {
  console.error("Set VK to a virtual key that resolves to the mock upstream. See bench/README.md.");
  process.exit(1);
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

async function hit(url, headers, i) {
  const body = JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 16,
    // unique content each call → always a cache MISS → full forward path measured
    messages: [{ role: "user", content: "bench request " + i + " " + Math.random() }],
  });
  const t = process.hrtime.bigint();
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  await r.text();
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, ok: r.status === 200 };
}

async function run(label, url, headers) {
  for (let i = 0; i < WARMUP; i++) await hit(url, headers, i);
  const lat = [];
  let bad = 0;
  for (let i = 0; i < N; i++) {
    const r = await hit(url, headers, i);
    if (r.ok) lat.push(r.ms);
    else bad++;
  }
  return { label, mean: mean(lat), p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), n: lat.length, bad };
}

const gw = await run("gateway", GATEWAY, { "x-api-key": VK, "anthropic-version": "2023-06-01" });
const direct = await run("direct-mock", MOCK, {});

const fmt = (r) =>
  `${r.label.padEnd(12)} mean=${r.mean.toFixed(2)}ms p50=${r.p50.toFixed(2)}ms p95=${r.p95.toFixed(2)}ms p99=${r.p99.toFixed(2)}ms (n=${r.n}, errors=${r.bad})`;
console.log(fmt(gw));
console.log(fmt(direct));
console.log("---");
console.log(
  `gateway overhead: mean=${(gw.mean - direct.mean).toFixed(2)}ms p50=${(gw.p50 - direct.p50).toFixed(2)}ms ` +
    `p95=${(gw.p95 - direct.p95).toFixed(2)}ms p99=${(gw.p99 - direct.p99).toFixed(2)}ms`,
);
