import { type Adapter, forwardableHeaders } from "./types";

/**
 * Azure OpenAI. Differs from direct OpenAI in three ways the adapter handles:
 *   - auth via the `api-key` header (not `Authorization: Bearer`)
 *   - a deployment-scoped path: /openai/deployments/<deployment>/<op>
 *   - a required `api-version` query param
 * Convention: the deployment is named after the model (the usual setup), so the
 * client's `model` maps straight to the deployment. Byte-transparent otherwise
 * → streaming and the tee work unchanged.
 */
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";

function operation(pathname: string): string {
  if (pathname.endsWith("/chat/completions")) return "chat/completions";
  if (pathname.endsWith("/embeddings")) return "embeddings";
  if (pathname.endsWith("/completions")) return "completions";
  return "chat/completions";
}

export const azureAdapter: Adapter = {
  kind: "azure",
  supportsStreaming: () => true,
  prepare(cred, req, defaultBaseUrl) {
    const base = cred.baseUrl ?? defaultBaseUrl; // https://<resource>.openai.azure.com
    const deployment = encodeURIComponent(req.model);
    const url = new URL(`/openai/deployments/${deployment}/${operation(req.pathname)}`, base);
    url.searchParams.set("api-version", API_VERSION);
    const headers = forwardableHeaders(req.headers);
    headers.set("api-key", cred.secret);
    return { url, headers, body: req.body.byteLength > 0 ? req.body : undefined };
  },
};
