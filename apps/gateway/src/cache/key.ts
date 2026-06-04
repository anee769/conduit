import { createHash } from "node:crypto";

/**
 * Pure cache-key derivation (no Redis import → unit-testable in isolation).
 *
 * Locked decision: conservative normalization only — canonicalize JSON (sorted
 * keys, stable whitespace) and strip volatile fields. NEVER normalize semantics
 * (that's the Phase-2 semantic cache); a wrong hit on generated code is
 * unacceptable.
 */

// Volatile request fields that don't change the completion — stripped from the key.
const VOLATILE = new Set(["request_id", "requestId"]);

/** Recursively sort object keys and drop volatile fields → canonical form. */
export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      if (VOLATILE.has(k)) continue;
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** Cache key for a request, or null if the body isn't JSON (uncacheable). */
export function cacheKeyFor(provider: string, path: string, rawBody: ArrayBuffer): string | null {
  if (rawBody.byteLength === 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(rawBody));
    const norm = JSON.stringify(canonical(parsed));
    return "cache:" + createHash("sha256").update(`${provider}\n${path}\n${norm}`).digest("hex");
  } catch {
    return null;
  }
}
