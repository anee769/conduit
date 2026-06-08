/**
 * Data-governance secrets scanner (Phase 2, Tier 1 — "T1").
 *
 * Pure, dependency-free, deterministic pattern matching over a request body to
 * detect high-confidence structured secrets BEFORE the request leaves the
 * customer's perimeter for an LLM provider. This is the governance gate that
 * lets a security team approve coding agents at all.
 *
 * PRIVACY (non-negotiable, mirrors the gateway's no-body-storage promise):
 *   - We NEVER return, log, or store the matched value — only its CATEGORY.
 *   - The caller records category names only; the secret itself is discarded
 *     the moment scanning completes.
 *
 * Scope: Tier 1 is fixed, universal patterns (API keys, tokens, private keys) —
 * near-zero false positives, sub-millisecond cost. Per-org contextual entities
 * (customer names, internal codenames, revenue figures) are Tier 2 and are built
 * against a design partner's real traffic — deliberately NOT here.
 */

export type SecretHit = {
  /** Human-facing category, surfaced on the dashboard. Never the value. */
  category: string;
  /** Stable rule identifier (for debugging / metrics). Never the value. */
  ruleId: string;
};

type Rule = { ruleId: string; category: string; re: RegExp };

// High-confidence, structured-secret patterns. Each is anchored enough to keep
// false positives near zero. Order is irrelevant — every rule is evaluated.
const RULES: Rule[] = [
  { ruleId: "aws_access_key_id", category: "aws_credentials", re: /\b(?:AKIA|ASIA|AGPA|AROA|AIDA|ANPA|ANVA|AIPA)[A-Z0-9]{16}\b/ },
  { ruleId: "private_key_block", category: "private_key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { ruleId: "github_token", category: "github_token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/ },
  { ruleId: "github_pat_fine", category: "github_token", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { ruleId: "anthropic_api_key", category: "provider_api_key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { ruleId: "openai_api_key", category: "provider_api_key", re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { ruleId: "google_api_key", category: "google_api_key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { ruleId: "slack_token", category: "slack_token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { ruleId: "stripe_secret_key", category: "stripe_key", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/ },
  { ruleId: "jwt", category: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  // Generic "secret = '...'" assignment. Conservative: needs a sensitive key
  // name AND a quoted value of reasonable length.
  { ruleId: "generic_assigned_secret", category: "generic_secret", re: /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i },
];

/**
 * Scan a request body for known secret patterns. Returns one hit per matched
 * rule (deduplicated by ruleId), with category + ruleId ONLY — never the value.
 * Returns an empty array for clean input. Never throws.
 */
export function scanSecrets(text: string): SecretHit[] {
  if (!text) return [];
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (seen.has(rule.ruleId)) continue;
    if (rule.re.test(text)) {
      seen.add(rule.ruleId);
      hits.push({ category: rule.category, ruleId: rule.ruleId });
    }
  }
  return hits;
}

/** Distinct categories from a set of hits (what the dashboard/event records). */
export function categoriesOf(hits: SecretHit[]): string[] {
  return [...new Set(hits.map((h) => h.category))].sort();
}
