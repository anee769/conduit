/**
 * Governance runtime configuration (Phase 2).
 *
 * Driven by env vars, hot-reloadable via POST /admin/reload. The shape is
 * forward-compatible with per-ORG Tier-2 policy (built against a design
 * partner's real traffic).
 *
 *   GOVERNANCE_ENABLED  on|off      (default: on)    — run the T1 secrets scan
 *   GOVERNANCE_MODE     alert|block (default: alert)  — the GLOBAL default action
 *       alert → detect, record, and forward (visibility only)
 *       block → reject the request with 451 before it reaches the provider
 *   GOVERNANCE_BLOCK_CATEGORIES  csv (default: none)  — the per-category
 *       promote-to-block list: these categories ALWAYS block, even while the
 *       global mode is `alert`. This is the alert→block feedback loop: an org
 *       runs in alert, watches which categories fire (and their false-positive
 *       rate) on the dashboard, then promotes the high-confidence ones one at a
 *       time — without flipping the whole policy to block.
 *   GOVERNANCE_ENTITIES  JSON array OR csv (default: none) — per-org Tier-2-lite
 *       entity allowlist. Operator-configured strings (customer names, internal
 *       codenames, deal codes) that scanEntities() flags as the `org_entity`
 *       category. Whole-word, case-insensitive. CSV is fine for entity names
 *       without commas; use JSON for anything trickier:
 *           GOVERNANCE_ENTITIES='["Acme Corp", "Project Nimbus", "Q4-DEAL-21"]'
 *
 * Default is `alert` with no promoted categories and no entities: governance
 * ships safe (it can never break a coding session on day one).
 */

export type GovernanceMode = "alert" | "block";
export type GovernanceAction = "alert" | "block";

export type GovernanceConfig = {
  enabled: boolean;
  mode: GovernanceMode;
  /** Categories promoted to block while the global mode is still alert. */
  blockCategories: string[];
  /** Per-org entity allowlist (Tier 2-lite). Empty by default. */
  entities: string[];
};

function parseEntities(raw: string | undefined): string[] {
  const v = (raw ?? "").trim();
  if (!v) return [];
  if (v.startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // fall through to CSV
    }
  }
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseConfig(): GovernanceConfig {
  const enabled = (process.env.GOVERNANCE_ENABLED ?? "on").toLowerCase() !== "off";
  const mode: GovernanceMode = (process.env.GOVERNANCE_MODE ?? "alert").toLowerCase() === "block" ? "block" : "alert";
  const blockCategories = (process.env.GOVERNANCE_BLOCK_CATEGORIES ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const entities = parseEntities(process.env.GOVERNANCE_ENTITIES);
  return { enabled, mode, blockCategories, entities };
}

let cached: GovernanceConfig = parseConfig();

/** Current governance config (cached; re-read via reloadGovernance()). */
export function governanceConfig(): GovernanceConfig {
  return cached;
}

/**
 * The action to take for a request that hit the given categories: `block` if the
 * global mode is block OR any hit category has been promoted to block; otherwise
 * `alert`. Pure given the cached config.
 */
export function effectiveAction(categories: string[]): GovernanceAction {
  const cfg = cached;
  if (cfg.mode === "block") return "block";
  if (cfg.blockCategories.length > 0 && categories.some((c) => cfg.blockCategories.includes(c))) {
    return "block";
  }
  return "alert";
}

/** Re-read env config in place — wired into POST /admin/reload. */
export function reloadGovernance(): void {
  cached = parseConfig();
}
