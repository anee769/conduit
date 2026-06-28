import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { AUTH_COOKIE, tokenFor } from "./dashboard-auth";

/**
 * Admin API guard.
 *
 * Two valid auth paths:
 *   1. `Authorization: Bearer <token>` / `x-admin-token: <token>` — programmatic
 *      access (CLI, scripts, the /setup wizard's first-time bootstrap). Compared
 *      against `ADMIN_TOKEN` with `timingSafeEqual`.
 *   2. A valid dashboard auth cookie — human access via the browser. Set when
 *      the operator logs in with `DASHBOARD_PASSWORD`. Lets the /setup wizard
 *      and the dashboard's admin actions work without manually pasting the
 *      admin token in the browser.
 *
 * Production safeguard: when `NODE_ENV=production` and NEITHER `ADMIN_TOKEN`
 * NOR `DASHBOARD_PASSWORD` is configured, the admin API refuses to authorize
 * any call. Operators can opt out with `ALLOW_OPEN_ADMIN=1` (loud, explicit).
 */
export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  const expected = process.env.ADMIN_TOKEN;
  const dashPassword = process.env.DASHBOARD_PASSWORD;
  const isProd = process.env.NODE_ENV === "production";
  const explicitlyOpen = process.env.ALLOW_OPEN_ADMIN === "1";

  // Path 1: programmatic auth via Authorization / x-admin-token.
  if (expected) {
    const auth = req.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    const presented = bearer ?? req.headers.get("x-admin-token") ?? "";
    if (presented) {
      const a = Buffer.from(presented, "utf8");
      const b = Buffer.from(expected, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return null;
    }
  }

  // Path 2: dashboard cookie. Means a human has logged in with
  // DASHBOARD_PASSWORD, so they're trusted to drive the admin UI.
  if (dashPassword) {
    const cookie = req.headers.get("cookie") ?? "";
    const presented = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${AUTH_COOKIE}=`))
      ?.slice(AUTH_COOKIE.length + 1);
    if (presented && presented === (await tokenFor(dashPassword))) return null;
  }

  // Neither path succeeded. Decide whether to 401 or 503.
  if (!expected && !dashPassword) {
    if (isProd && !explicitlyOpen) {
      return NextResponse.json(
        {
          error:
            "admin API requires either ADMIN_TOKEN (for programmatic access) or DASHBOARD_PASSWORD (for browser access) in production",
          type: "configuration_error",
          hint: "set DASHBOARD_PASSWORD to enable the /setup wizard, or ALLOW_OPEN_ADMIN=1 to opt out (not recommended)",
        },
        { status: 503 },
      );
    }
    return null; // dev / pre-setup, both unset → open
  }

  return NextResponse.json(
    { error: "admin authentication required", type: "authentication_error" },
    { status: 401 },
  );
}
