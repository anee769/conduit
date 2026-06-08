import { type Adapter, forwardableHeaders } from "./types";

/** Direct Anthropic API — header key injection (`x-api-key`). The MVP default. */
export const anthropicAdapter: Adapter = {
  kind: "anthropic",
  supportsStreaming: () => true,
  prepare(cred, req, defaultBaseUrl) {
    const base = cred.baseUrl ?? defaultBaseUrl;
    const url = new URL(req.pathname + req.search, base);
    const headers = forwardableHeaders(req.headers);
    headers.set("x-api-key", cred.secret);
    if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");
    return { url, headers, body: req.body.byteLength > 0 ? req.body : undefined };
  },
};
