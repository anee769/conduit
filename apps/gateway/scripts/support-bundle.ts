/**
 * support-bundle — capture a redacted operational snapshot for debugging an
 * on-prem install, without ever touching prompts/completions or secrets.
 *
 *   pnpm --filter @finops/gateway support-bundle
 *   GATEWAY_URL=http://localhost:4000 pnpm --filter @finops/gateway support-bundle
 *
 * Writes a folder of: health.json, ready.json, metrics.txt, config.json
 * (env with secret values redacted), versions.json. Hand the folder to support.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../src/version";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";

// Any env var whose name matches these is shown as "<redacted>".
const SECRET_HINT = /(KEY|SECRET|TOKEN|PASSWORD|URL)/i;

async function grab(path: string): Promise<string> {
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`);
    return await res.text();
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

function redactedEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("PORT") && !k.startsWith("FAIL_") && !k.startsWith("METER_") &&
        !k.startsWith("CACHE_") && !k.startsWith("UPSTREAM_") && !SECRET_HINT.test(k)) {
      continue; // keep the bundle focused on this app's config
    }
    out[k] = SECRET_HINT.test(k) ? "<redacted>" : String(v);
  }
  return out;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), `support-bundle-${stamp}`);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "health.json"), await grab("/health"));
  writeFileSync(join(dir, "ready.json"), await grab("/ready"));
  writeFileSync(join(dir, "metrics.txt"), await grab("/metrics"));
  writeFileSync(join(dir, "config.json"), JSON.stringify(redactedEnv(), null, 2));
  writeFileSync(
    join(dir, "versions.json"),
    JSON.stringify(
      { gatewayVersion: VERSION, node: process.version, platform: process.platform, capturedAt: stamp },
      null,
      2,
    ),
  );

  // eslint-disable-next-line no-console
  console.log(`support bundle written to ${dir}`);
}

await main();
