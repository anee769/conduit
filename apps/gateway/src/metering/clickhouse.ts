import pino from "pino";

/**
 * Minimal ClickHouse client over the HTTP interface (port 8123).
 *
 * Deliberately dependency-free: ClickHouse's HTTP endpoint takes the SQL as the
 * `query` string param and row data as the request body, so a plain `fetch`
 * covers everything we need (DDL, batched JSONEachRow inserts, ping). Avoiding
 * the native driver keeps the on-prem image small and audit-friendly.
 */

const logger = pino({ name: "clickhouse" });

type ChConn = {
  origin: string; // http://host:8123
  database: string;
  authHeader: string | null;
};

function parseConn(): ChConn {
  const raw = process.env.CLICKHOUSE_URL ?? "http://finops:finops@localhost:8123/finops";
  const u = new URL(raw);
  const database = u.pathname.replace(/^\//, "") || "default";
  const authHeader =
    u.username || u.password
      ? "Basic " + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString("base64")
      : null;
  return { origin: `${u.protocol}//${u.host}`, database, authHeader };
}

const conn = parseConn();

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (conn.authHeader) h["authorization"] = conn.authHeader;
  return h;
}

/** Run a statement that returns no rows (DDL, etc.). Throws on non-2xx. */
export async function chExec(sqlText: string): Promise<void> {
  const res = await fetch(`${conn.origin}/?database=${encodeURIComponent(conn.database)}`, {
    method: "POST",
    headers: headers({ "content-type": "text/plain" }),
    body: sqlText,
  });
  if (!res.ok) {
    throw new Error(`clickhouse exec ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Batch-insert rows as JSONEachRow. `table` columns must match object keys. */
export async function chInsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  const query = `INSERT INTO ${table} FORMAT JSONEachRow`;
  const url = `${conn.origin}/?database=${encodeURIComponent(conn.database)}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers({ "content-type": "application/x-ndjson" }),
    body,
  });
  if (!res.ok) {
    throw new Error(`clickhouse insert ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Liveness probe for /ready. */
export async function pingClickhouse(): Promise<boolean> {
  const res = await fetch(`${conn.origin}/ping`, { headers: headers() });
  return res.ok;
}

/**
 * Create the usage_events table if it doesn't exist. Called once at boot.
 * MergeTree partitioned by month, ordered by (org_id, ts) — the dashboard's
 * dominant query is "this org's spend over a time range".
 */
export async function initUsageSchema(): Promise<void> {
  await chExec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      event_id        UUID,
      org_id          UUID,
      team_id         Nullable(UUID),
      virtual_key_id  Nullable(UUID),
      ts              DateTime64(3),
      provider        LowCardinality(String),
      model           LowCardinality(String),
      request_type    LowCardinality(String),
      status          LowCardinality(String),
      http_status     UInt16,
      input_tokens    UInt32,
      output_tokens   UInt32,
      cached_tokens   UInt32,
      cost_usd        Float64,
      latency_ms      UInt32,
      ttft_ms         Nullable(UInt32),
      cache_hit       UInt8,
      error_code      Nullable(String),
      request_id      Nullable(String),
      governance_flagged    UInt8 DEFAULT 0,
      governance_categories Array(String) DEFAULT []
    )
    ENGINE = MergeTree()
    PARTITION BY toYYYYMM(ts)
    ORDER BY (org_id, ts)
  `);
  // Backward-compatible column adds for tables created before governance (M-gov).
  // ALTER ... ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
  await chExec(`ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS governance_flagged UInt8 DEFAULT 0`);
  await chExec(`ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS governance_categories Array(String) DEFAULT []`);
  logger.info("usage_events schema ready");
}
