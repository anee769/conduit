import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Admin API guard.
 *
 * - In production (`NODE_ENV=production`) the admin API REFUSES to authorize
 *   any call unless `ADMIN_TOKEN` is set OR the operator has explicitly
 *   opted out with `ALLOW_OPEN_ADMIN=1`. Closes the "deployed without a
 *   token and didn't notice" footgun.
 * - In dev / pre-setup, unset `ADMIN_TOKEN` keeps the API open for the
 *   first-run wizard.
 * - Token comparison is constant-time (Node crypto `timingSafeEqual`).
 */
export function requireAdmin(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN;
  const isProd = process.env.NODE_ENV === "production";
  const explicitlyOpen = process.env.ALLOW_OPEN_ADMIN === "1";

  if (!expected) {
    if (isProd && !explicitlyOpen) {
      return NextResponse.json(
        {
          error: "admin authentication is required in production but ADMIN_TOKEN is not set",
          type: "configuration_error",
          hint: "set ADMIN_TOKEN, or set ALLOW_OPEN_ADMIN=1 to explicitly opt out (not recommended)",
        },
        { status: 503 },
      );
    }
    return null; // dev / pre-setup → open
  }

  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const presented = bearer ?? req.headers.get("x-admin-token") ?? "";

  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) return null;

  return NextResponse.json(
    { error: "admin authentication required", type: "authentication_error" },
    { status: 401 },
  );
}
