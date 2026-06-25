/**
 * Pure derivation of the dashboard's security posture from the live env.
 * Drives the in-app /security page so the operator (and any auditor with
 * dashboard access) can see exactly what's enforced, what isn't, and what's
 * deliberately not built yet — without reading the source.
 *
 * No secrets are returned: only the SHAPE of each setting (set vs unset,
 * enforced vs open). The values themselves stay in env.
 */

export type PostureRow = {
  label: string;
  /** "enforced" — fully on. "partial" — on but with caveats. "off" — not configured. */
  status: "enforced" | "partial" | "off";
  detail: string;
};

export type Posture = {
  generatedAt: string;
  controls: PostureRow[];
  /** Free-text honest list of what we haven't built. Shown verbatim. */
  notYetBuilt: string[];
};

export function computePosture(): Posture {
  const env = process.env;
  const isProd = env.NODE_ENV === "production";

  const dashPwdSet = !!env.DASHBOARD_PASSWORD;
  const dashSecretSet = !!env.DASHBOARD_SECRET;
  const adminTokenSet = !!env.ADMIN_TOKEN;
  const allowOpen = env.ALLOW_OPEN_ADMIN === "1";
  const masterKeySet =
    !!env.MASTER_ENCRYPTION_KEY && env.MASTER_ENCRYPTION_KEY !== "change-me-generate-a-32-byte-key";
  const govEnabled = (env.GOVERNANCE_ENABLED ?? "on").toLowerCase() !== "off";
  const govMode = (env.GOVERNANCE_MODE ?? "alert").toLowerCase();
  const govPromoted = (env.GOVERNANCE_BLOCK_CATEGORIES ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const controls: PostureRow[] = [
    {
      label: "Dashboard auth",
      status: dashPwdSet ? "enforced" : "off",
      detail: dashPwdSet
        ? "shared password (httpOnly cookie, constant-time compare, login rate-limited)"
        : "open — DASHBOARD_PASSWORD is not set",
    },
    {
      label: "Dashboard cookie secret",
      status: dashSecretSet ? "enforced" : "partial",
      detail: dashSecretSet
        ? "DASHBOARD_SECRET set — cookie tokens are unguessable across deploys"
        : "using built-in default — set DASHBOARD_SECRET in production",
    },
    {
      label: "Admin API auth",
      status: adminTokenSet ? "enforced" : (isProd && !allowOpen ? "enforced" : (allowOpen ? "off" : "partial")),
      detail: adminTokenSet
        ? "bearer token (constant-time compare)"
        : isProd && !allowOpen
          ? "blocked — production refuses calls until ADMIN_TOKEN is set"
          : allowOpen
            ? "open by explicit opt-in (ALLOW_OPEN_ADMIN=1) — do not run this in production"
            : "open in dev — set ADMIN_TOKEN before exposing the dashboard",
    },
    {
      label: "Provider credentials at rest",
      status: masterKeySet ? "enforced" : "off",
      detail: masterKeySet
        ? "AES-256-GCM (Node WebCrypto), key from MASTER_ENCRYPTION_KEY"
        : "MASTER_ENCRYPTION_KEY not set to a real value — credentials cannot be sealed",
    },
    {
      label: "Egress governance",
      status: govEnabled ? (govMode === "block" || govPromoted.length > 0 ? "enforced" : "partial") : "off",
      detail: govEnabled
        ? govMode === "block"
          ? "global block mode — all flagged requests rejected with 451"
          : govPromoted.length > 0
            ? `alert mode + ${govPromoted.length} promoted-to-block ${govPromoted.length === 1 ? "category" : "categories"}: ${govPromoted.join(", ")}`
            : "alert mode — flagged categories recorded, no requests blocked"
        : "disabled — GOVERNANCE_ENABLED=off",
    },
    {
      label: "Prompt / completion bodies",
      status: "enforced",
      detail: "never stored — metadata only; verified by automated test",
    },
    {
      label: "Login brute-force protection",
      status: "enforced",
      detail: "in-process sliding window — 5 attempts per IP per 15 minutes",
    },
    {
      label: "Cookie security flags",
      status: isProd ? "enforced" : "partial",
      detail: isProd
        ? "httpOnly + Secure + SameSite=Lax"
        : "httpOnly + SameSite=Lax (Secure off in dev so cookies work over http://localhost)",
    },
  ];

  const notYetBuilt = [
    "SSO / SAML / OIDC — single shared dashboard password today",
    "RBAC — anyone with the password is admin",
    "Per-user accounts + audit-of-who-did-what — coming with SSO",
    "2FA / TOTP",
    "Password rotation from the UI (rotate via env var + redeploy today)",
    "SOC 2 Type II certificate — design supports your audit; no Conduit-side audit yet",
  ];

  return { generatedAt: new Date().toISOString(), controls, notYetBuilt };
}
