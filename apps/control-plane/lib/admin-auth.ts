import { NextResponse } from "next/server";

/**
 * Admin API guard (MVP, single-admin org — full RBAC is Phase 3).
 *
 * If ADMIN_TOKEN is set, every admin call must present it as
 * `Authorization: Bearer <token>` or `x-admin-token`. If it is unset (local
 * dev / first boot before the wizard), calls are allowed — production installs
 * MUST set ADMIN_TOKEN. A 401 NextResponse is returned when the check fails,
 * otherwise null (proceed).
 */
export function requireAdmin(req: Request): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return null; // not configured → open (dev / pre-setup)
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const presented = bearer ?? req.headers.get("x-admin-token");
  if (presented === expected) return null;
  return NextResponse.json(
    { error: "admin authentication required", type: "authentication_error" },
    { status: 401 },
  );
}
