import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 — the request signing Bedrock requires (header-based
 * key injection isn't enough; every call must be signed with the org's AWS
 * credentials). Pure, dependency-free, and unit-tested against the published
 * AWS SigV4 "get-vanilla" test-suite vector so the crypto is provably correct.
 *
 * https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 */

const sha256hex = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string): Buffer => createHmac("sha256", key).update(data, "utf8").digest();

/** Derive the date→region→service→aws4_request signing key chain. */
export function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export type SigV4Input = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string; // e.g. "bedrock"
  method: string; // "POST"
  host: string; // bedrock-runtime.us-east-1.amazonaws.com
  path: string; // canonical URI, e.g. "/model/<id>/invoke"
  query?: string; // canonical query string ("" if none)
  body: string; // request payload
  /** Extra headers to sign (lowercased on the way in), e.g. content-type. */
  extraHeaders?: Record<string, string>;
  /** Include x-amz-content-sha256 in the signed set (true for Bedrock). */
  includeContentSha256?: boolean;
  /** Override the clock (tests). */
  now?: Date;
};

/**
 * Sign a request and return the full header set to send upstream (host,
 * x-amz-date, [x-amz-content-sha256], any extras, and Authorization).
 */
export function signRequest(input: SigV4Input): Record<string, string> {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(input.body);

  // Build the signed header set (all keys lowercased).
  const headers: Record<string, string> = { host: input.host, "x-amz-date": amzDate };
  if (input.includeContentSha256 ?? true) headers["x-amz-content-sha256"] = payloadHash;
  for (const [k, v] of Object.entries(input.extraHeaders ?? {})) headers[k.toLowerCase()] = v;

  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames.map((k) => `${k}:${headers[k]!.trim()}\n`).join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    input.method,
    input.path,
    input.query ?? "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signingKey = deriveSigningKey(input.secretAccessKey, dateStamp, input.region, input.service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
