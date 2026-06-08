import { type Adapter, forwardableHeaders } from "./types";

/** Direct OpenAI API — `Authorization: Bearer <key>`. */
export const openaiAdapter: Adapter = {
  kind: "openai",
  supportsStreaming: () => true,
  prepare(cred, req, defaultBaseUrl) {
    const base = cred.baseUrl ?? defaultBaseUrl;
    const url = new URL(req.pathname + req.search, base);
    const headers = forwardableHeaders(req.headers);
    headers.set("authorization", `Bearer ${cred.secret}`);
    return { url, headers, body: req.body.byteLength > 0 ? req.body : undefined };
  },
};
