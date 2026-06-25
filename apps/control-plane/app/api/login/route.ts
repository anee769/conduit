import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { AUTH_COOKIE, tokenFor } from "../../../lib/dashboard-auth";
import { check, clientIp, reset } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time string compare. Safe against length differences. */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Still touch a buffer of equal length so the work is uniform.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/** Validate the dashboard password and, on success, set the auth cookie. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = check(`login:${ip}`);
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  const nextRaw = String(form?.get("next") ?? "/");
  const next = nextRaw.startsWith("/") ? nextRaw : "/";
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!rl.allowed) {
    return NextResponse.redirect(
      new URL(`/login?error=rate&retry=${rl.retryAfterSec}&next=${encodeURIComponent(next)}`, req.url),
      303,
    );
  }

  if (!expected || !safeEqual(password, expected)) {
    return NextResponse.redirect(
      new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url),
      303,
    );
  }

  reset(`login:${ip}`);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(AUTH_COOKIE, await tokenFor(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
