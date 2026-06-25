import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, tokenFor } from "./lib/dashboard-auth";

/**
 * Dashboard auth gate. Protects the human-facing UI routes when
 * DASHBOARD_PASSWORD is set; no-ops (open) when it isn't.
 *
 * The matcher deliberately EXCLUDES /api/* — those endpoints are either
 * ADMIN_TOKEN-guarded (admin API) or used programmatically / by health checks
 * and the test suite (/api/usage). The gate is for the browser dashboard.
 */
export async function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next(); // unset → open (dev / pre-setup)

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await tokenFor(password))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // /security is publicly viewable on purpose — it's honest posture disclosure
  // (no secrets returned, only the SHAPE of each setting). Lets buyers and
  // auditors verify what's enforced without logging in.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|security).*)"],
};
