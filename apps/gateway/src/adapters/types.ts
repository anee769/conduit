/**
 * Provider adapter layer.
 *
 * The gateway exposes two *client API families* — Anthropic (`/v1/messages`) and
 * OpenAI (`/v1/chat/completions`, …). Each family can be served by more than one
 * *upstream provider*:
 *
 *   anthropic family → `anthropic` (direct) | `bedrock` (AWS, SigV4)
 *   openai    family → `openai`    (direct) | `azure`   (Azure OpenAI)
 *
 * An adapter's only job is to turn a client request into the upstream HTTP call
 * for one provider: the target URL, the auth headers, and (Bedrock only) a
 * lightly-rewritten body. Metering, pricing, caching, and the tee are unchanged
 * — the meter provider is always the *family* (azure meters as openai, bedrock
 * as anthropic), which is why the rest of the hot path never branches on this.
 */

export type ApiFamily = "anthropic" | "openai";
export type ProviderKind = "anthropic" | "openai" | "azure" | "bedrock";

/** A resolved, decrypted upstream credential plus which provider it is. */
export type ResolvedCredential = {
  providerKind: ProviderKind;
  /** Direct providers: the API key. Bedrock: "accessKeyId:secretAccessKey". */
  secret: string;
  /** Per-credential upstream override (Azure resource URL, Bedrock region/endpoint). */
  baseUrl: string | null;
};

export type UpstreamRequest = {
  method: string;
  pathname: string;
  search: string;
  model: string;
  /** Incoming client headers (the virtual key is stripped by the adapter). */
  headers: Record<string, string>;
  body: ArrayBuffer;
  stream: boolean;
};

export type PreparedUpstream = {
  url: URL;
  headers: Headers;
  /** Usually the original body verbatim; Bedrock rewrites it. */
  body: ArrayBuffer | undefined;
};

export interface Adapter {
  kind: ProviderKind;
  /** Whether this provider can serve a streaming request via this gateway. */
  supportsStreaming(req: UpstreamRequest): boolean;
  /** Build the upstream call (URL + headers + body) for one request. */
  prepare(cred: ResolvedCredential, req: UpstreamRequest, defaultBaseUrl: string): PreparedUpstream;
}

// Hop-by-hop headers must not cross a proxy (RFC 7230 §6.1); see proxy.ts for
// why content-encoding is included. Shared so every adapter strips them.
export const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "content-encoding",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
  "te",
  "trailer",
]);

/** Copy client headers minus hop-by-hop and the client's auth (virtual key). */
export function forwardableHeaders(incoming: Record<string, string>): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === "authorization" || lower === "x-api-key") continue;
    out.set(key, value);
  }
  return out;
}
