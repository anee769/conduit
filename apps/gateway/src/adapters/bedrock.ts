import { type Adapter, ResolvedCredential, UpstreamRequest } from "./types";
import { signRequest } from "./sigv4";

/**
 * AWS Bedrock (Anthropic models). Unlike header-injection providers, every call
 * is SigV4-signed with the org's AWS credentials, the model id moves into the
 * URL, and the body gets a small rewrite. The org stores its credential as
 * provider="bedrock", secret="accessKeyId:secretAccessKey", baseUrl=<region or
 * endpoint>.
 *
 * Scope: the non-streaming `/invoke` endpoint (returns JSON we can meter).
 * Streaming uses `/invoke-with-response-stream` (binary AWS event-stream framing)
 * which the SSE tee/meter can't parse yet → supportsStreaming() is false and the
 * proxy rejects a streaming Bedrock request with a clear error.
 */

// Common client model ids → Bedrock model ids. Falls back to the raw model so an
// org can also pass a Bedrock id directly.
const MODEL_MAP: Record<string, string> = {
  "claude-opus-4": "anthropic.claude-opus-4-20250514-v1:0",
  "claude-sonnet-4": "anthropic.claude-sonnet-4-20250514-v1:0",
  "claude-haiku-4": "anthropic.claude-3-5-haiku-20241022-v1:0",
};

function bedrockModelId(model: string): string {
  return MODEL_MAP[model] ?? model;
}

function regionAndHost(baseUrl: string | null): { region: string; host: string } {
  const fallback = process.env.AWS_REGION ?? "us-east-1";
  if (!baseUrl) return { region: fallback, host: `bedrock-runtime.${fallback}.amazonaws.com` };
  if (/^[a-z]{2}-[a-z]+-\d$/.test(baseUrl)) return { region: baseUrl, host: `bedrock-runtime.${baseUrl}.amazonaws.com` };
  try {
    const u = new URL(baseUrl);
    const m = u.host.match(/bedrock-runtime\.([a-z0-9-]+)\.amazonaws\.com/);
    return { region: m?.[1] ?? fallback, host: u.host };
  } catch {
    return { region: fallback, host: `bedrock-runtime.${fallback}.amazonaws.com` };
  }
}

export const bedrockAdapter: Adapter = {
  kind: "bedrock",
  supportsStreaming: () => false,
  prepare(cred: ResolvedCredential, req: UpstreamRequest) {
    const [accessKeyId, secretAccessKey] = cred.secret.split(":");
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("bedrock credential must be 'accessKeyId:secretAccessKey'");
    }
    const { region, host } = regionAndHost(cred.baseUrl);
    const modelId = bedrockModelId(req.model);
    const path = `/model/${encodeURIComponent(modelId)}/invoke`;

    // Body rewrite: Bedrock's Anthropic API drops the top-level `model` (it's in
    // the URL) and requires an anthropic_version marker.
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(new TextDecoder().decode(req.body)) as Record<string, unknown>;
    } catch {
      /* non-JSON body — send through as-is shape */
    }
    delete payload.model;
    delete payload.stream;
    payload.anthropic_version = "bedrock-2023-05-31";
    const bodyStr = JSON.stringify(payload);

    const signed = signRequest({
      accessKeyId,
      secretAccessKey,
      region,
      service: "bedrock",
      method: "POST",
      host,
      path,
      body: bodyStr,
      extraHeaders: { "content-type": "application/json" },
    });

    const headers = new Headers();
    for (const [k, v] of Object.entries(signed)) headers.set(k, v);
    headers.set("content-type", "application/json");

    const url = new URL(`https://${host}${path}`);
    return { url, headers, body: new TextEncoder().encode(bodyStr).buffer };
  },
};
