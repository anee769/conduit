/**
 * Shared helpers for the live system tests. Each test file provisions its OWN
 * org (via the control-plane admin API) so files can run in parallel without
 * interfering through shared budget counters or rate limits.
 *
 * Assumes the dev stack is up: datastores (docker compose), the gateway
 * (pointed at the mock upstream), the control-plane, and the mock. The runner
 * script (scripts/run-system.ps1) brings these up.
 */

export const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";
export const CONTROL_URL = process.env.CONTROL_URL ?? "http://localhost:3000";
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://finops:finops@localhost:8123/finops";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function adminHeaders(): Record<string, string> {
  return { "content-type": "application/json", ...(ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {}) };
}

async function adminPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${CONTROL_URL}${path}`, { method: "POST", headers: adminHeaders(), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export async function adminGet(path: string): Promise<any> {
  const res = await fetch(`${CONTROL_URL}${path}`, { headers: adminHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

export async function adminDelete(path: string): Promise<Response> {
  return fetch(`${CONTROL_URL}${path}`, { method: "DELETE", headers: adminHeaders() });
}

let counter = 0;
export const uniq = (p = "t") => `${p}-${Date.now()}-${process.pid}-${counter++}`;

/** Create a fresh org + anthropic credential + team. Returns ids. */
export async function provision(label: string) {
  const { id: orgId } = await adminPost("/api/admin/orgs", { name: `org-${label}-${uniq()}` });
  await adminPost("/api/admin/credentials", { orgId, provider: "anthropic", displayName: "test", apiKey: "sk-test-key" });
  const { id: teamId } = await adminPost("/api/admin/teams", { orgId, name: `team-${label}` });
  return { orgId, teamId };
}

export async function createKey(orgId: string, opts: { teamId?: string; allowedModels?: string[]; rateLimitRpm?: number } = {}) {
  const res = await adminPost("/api/admin/keys", { orgId, name: `key-${uniq()}`, ...opts });
  return { id: res.id as string, token: res.virtualKey as string };
}

export async function createBudget(orgId: string, limitUsd: number, action: "block" | "alert" = "block") {
  return adminPost("/api/admin/budgets", { orgId, name: `budget-${uniq()}`, limitUsd, periodType: "monthly", action });
}

/** Force the gateway to re-read pricing + budgets so new rows take effect now. */
export async function reloadGateway(): Promise<void> {
  const res = await fetch(`${GATEWAY_URL}/admin/reload`, { method: "POST", headers: adminHeaders() });
  if (!res.ok) throw new Error(`gateway reload failed: ${res.status}`);
}

/** Send a proxied chat request with a virtual key. `nonce` keeps bodies unique. */
export async function chat(token: string | null, opts: { model?: string; nonce?: string; stream?: boolean } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-api-key"] = token;
  const body = JSON.stringify({
    model: opts.model ?? "claude-sonnet-4",
    stream: opts.stream ?? false,
    messages: [{ role: "user", content: `hello ${opts.nonce ?? ""}` }],
  });
  return fetch(`${GATEWAY_URL}/v1/messages`, { method: "POST", headers, body });
}

/** Query ClickHouse (FORMAT JSON) and return rows. */
export async function chQuery<T = any>(sql: string): Promise<T[]> {
  const u = new URL(CLICKHOUSE_URL);
  const db = u.pathname.replace(/^\//, "") || "default";
  const auth = u.username ? "Basic " + Buffer.from(`${u.username}:${u.password}`).toString("base64") : "";
  const res = await fetch(`${u.protocol}//${u.host}/?database=${db}`, {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: `${sql} FORMAT JSON`,
  });
  const json = (await res.json()) as { data: T[] };
  return json.data;
}

/** Poll until `fn` returns a truthy value (returned non-null) or it times out. */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 6000,
  everyMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
