import { NextResponse } from "next/server";
import { AUTH_COOKIE, tokenFor } from "../../../lib/dashboard-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validate the dashboard password and, on success, set the auth cookie. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  const nextRaw = String(form?.get("next") ?? "/");
  const next = nextRaw.startsWith("/") ? nextRaw : "/";
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.redirect(
      new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url),
      303,
    );
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(AUTH_COOKIE, await tokenFor(password), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
