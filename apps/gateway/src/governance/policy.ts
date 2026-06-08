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
 *
 * Default is `alert` with no promoted categories: governance ships safe (it can
 * never break a coding session on day one).
 */

export type GovernanceMode = "alert" | "block";
export type GovernanceAction = "alert" | "block";

export type GovernanceConfig = {
  enabled: boolean;
  mode: GovernanceMode;
  /** Categories promoted to block while the global mode is still alert. */
  blockCategories: string[];
};

function parseConfig(): GovernanceConfig {
  const enabled = (process.env.GOVERNANCE_ENABLED ?? "on").toLowerCase() !== "off";
  const mode: GovernanceMode = (process.env.GOVERNANCE_MODE ?? "alert").toLowerCase() === "block" ? "block" : "alert";
  const blockCategories = (process.env.GOVERNANCE_BLOCK_CATEGORIES ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return { enabled, mode, blockCategories };
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
