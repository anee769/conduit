import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Envelope encryption for provider credentials at rest (MVP_SPEC.md §7).
 * AES-256-GCM with a key derived from MASTER_ENCRYPTION_KEY via HKDF.
 * Stored format: base64(iv) : base64(authTag) : base64(ciphertext).
 *
 * No native deps — uses Node's built-in crypto. In production the derived key
 * would come from a KMS/Vault; the interface stays the same.
 */

const PLACEHOLDER = "change-me-generate-a-32-byte-key";

function deriveKey(): Buffer {
  const master = process.env.MASTER_ENCRYPTION_KEY;
  if (!master || master === PLACEHOLDER) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY is not set to a real value (generate with: openssl rand -base64 32)",
    );
  }
  // Deterministic 32-byte key from the master secret.
  const derived = hkdfSync(
    "sha256",
    Buffer.from(master, "utf8"),
    Buffer.alloc(0),
    Buffer.from("finops-provider-credential", "utf8"),
    32,
  );
  return Buffer.from(derived);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 3) {
    throw new Error("malformed encrypted secret");
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
