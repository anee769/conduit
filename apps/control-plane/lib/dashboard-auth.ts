/**
 * Minimal dashboard password gate (MVP — full SSO/RBAC is Phase 2/3).
 *
 * If DASHBOARD_PASSWORD is set, the dashboard UI requires it; the gate issues an
 * httpOnly cookie holding a SHA-256 token (never the password itself). If the
 * env var is UNSET, the dashboard is open — matching the admin-API convention
 * (open in dev / pre-setup, MUST be set in production).
 *
 * Uses Web Crypto (`crypto.subtle`) so the same helper runs in both the edge
 * middleware and the Node route handler.
 */

export const AUTH_COOKIE = "finops_dash";

/** Deterministic token for a password (SHA-256 of password + server secret). */
export async function tokenFor(password: string): Promise<string> {
  const secret = process.env.DASHBOARD_SECRET ?? "finops-dashboard-gate";
  const data = new TextEncoder().encode(`${password}::${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
