import { createHash, randomBytes } from "node:crypto";

/**
 * Virtual key generation & hashing (MVP_SPEC.md §5.1, §7).
 * The full token is shown to the user exactly once; we persist only its
 * sha256 hash (for lookup) and a non-secret prefix (for display).
 */

export interface GeneratedKey {
  token: string; // full secret — return to user once, never stored
  prefix: string; // safe to display, e.g. 'vk_live_ab12cd34'
  hash: string; // what we store + look up by
}

export function hashKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateVirtualKey(): GeneratedKey {
  const secret = randomBytes(24).toString("base64url");
  const token = `vk_live_${secret}`;
  return { token, prefix: token.slice(0, 16), hash: hashKey(token) };
}
