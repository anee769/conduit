import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuditEvents, type AuditRow } from "../../../lib/usage";
import { AUTH_COOKIE, tokenFor } from "../../../lib/dashboard-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Auditor-ready export of the usage event stream (metadata only — never prompts
 * or completions).
 *   GET /api/audit?days=30&format=csv|json&limit=5000
 *
 * Access: unlike /api/usage (open, for the dashboard + tests), the full audit
 * export can carry the whole window, so it is gated. It accepts EITHER the
 * dashboard login cookie (so the in-browser "Export" button works) OR an admin
 * token (`x-admin-token` / `Authorization: Bearer`) for programmatic/auditor
 * pulls. If NEITHER DASHBOARD_PASSWORD nor ADMIN_TOKEN is configured, it's open
 * — matching the rest of the MVP's dev-open / prod-must-set convention.
 */
async function authorize(req: Request): Promise<boolean> {
  const password = process.env.DASHBOARD_PASSWORD;
  const adminToken = process.env.ADMIN_TOKEN;

  // Nothing configured → open (dev / pre-setup).
  if (!password && !adminToken) return true;

  // Admin token path (programmatic / auditor).
  if (adminToken) {
    const auth = req.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    const presented = bearer ?? req.headers.get("x-admin-token");
    if (presented && presented === adminToken) return true;
  }

  // Dashboard cookie path (in-browser download after login).
  if (password) {
    const cookie = (await cookies()).get(AUTH_COOKIE)?.value;
    if (cookie && cookie === (await tokenFor(password))) return true;
  }

  return false;
}

const CSV_COLUMNS: { key: keyof AuditRow; header: string }[] = [
  { key: "ts", header: "timestamp_utc" },
  { key: "teamName", header: "team" },
  { key: "keyName", header: "virtual_key" },
  { key: "provider", header: "provider" },
  { key: "model", header: "model" },
  { key: "requestType", header: "request_type" },
  { key: "status", header: "status" },
  { key: "httpStatus", header: "http_status" },
  { key: "inputTokens", header: "input_tokens" },
  { key: "outputTokens", header: "output_tokens" },
  { key: "cachedTokens", header: "cached_tokens" },
  { key: "costUsd", header: "cost_usd" },
  { key: "latencyMs", header: "latency_ms" },
  { key: "governanceFlagged", header: "governance_flagged" },
  { key: "governanceCategories", header: "governance_categories" },
];

/** RFC-4180-safe field: quote when it contains comma, quote, or newline. */
function csvField(value: unknown): string {
  let s: string;
  if (Array.isArray(value)) s = value.join("|");
  else if (typeof value === "boolean") s = value ? "true" : "false";
  else s = String(value ?? "");
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: AuditRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => csvField(r[c.key])).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json(
      { error: "authentication required for audit export", type: "authentication_error" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
  const limit = Math.min(100_000, Math.max(1, Number(url.searchParams.get("limit") ?? 5000)));
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    const rows = await getAuditEvents(days, limit);

    if (format === "csv") {
      return new NextResponse(toCsv(rows), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="conduit-audit-${days}d-${stamp}.csv"`,
        },
      });
    }

    return new NextResponse(JSON.stringify({ days, count: rows.length, events: rows }, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="conduit-audit-${days}d-${stamp}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
