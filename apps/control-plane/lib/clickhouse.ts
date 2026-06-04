/**
 * Read-only ClickHouse client for the dashboard. Same zero-dependency HTTP
 * approach as the gateway's writer, but returns parsed JSON rows. Queries are
 * built server-side from a fixed set of aggregations (no user SQL), so the
 * dashboard never exposes an injection surface.
 */

type ChConn = { origin: string; database: string; authHeader: string | null };

function parseConn(): ChConn {
  const raw = process.env.CLICKHOUSE_URL ?? "http://finops:finops@localhost:8123/finops";
  const u = new URL(raw);
  const database = u.pathname.replace(/^\//, "") || "default";
  const authHeader =
    u.username || u.password
      ? "Basic " +
        Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString("base64")
      : null;
  return { origin: `${u.protocol}//${u.host}`, database, authHeader };
}

const conn = parseConn();

/** Run a SELECT and return typed rows (ClickHouse FORMAT JSON). */
export async function chQuery<T>(sql: string): Promise<T[]> {
  const res = await fetch(`${conn.origin}/?database=${encodeURIComponent(conn.database)}`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      ...(conn.authHeader ? { authorization: conn.authHeader } : {}),
    },
    body: `${sql} FORMAT JSON`,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`clickhouse query ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: T[] };
  return json.data;
}
