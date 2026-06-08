import { getProviderCredential } from "@finops/db";
import type { Adapter, ApiFamily, ProviderKind, ResolvedCredential } from "./types";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";
import { azureAdapter } from "./azure";
import { bedrockAdapter } from "./bedrock";

const REGISTRY: Record<ProviderKind, Adapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  azure: azureAdapter,
  bedrock: bedrockAdapter,
};

export function adapterFor(kind: ProviderKind): Adapter {
  return REGISTRY[kind];
}

// For each client API family, prefer the perimeter-friendly provider (Bedrock /
// Azure) when the org has configured one, else fall back to the direct API. This
// is what lets an org "put Conduit in front of their Bedrock" with no client
// change — they just add a bedrock credential.
const PRIORITY: Record<ApiFamily, ProviderKind[]> = {
  anthropic: ["bedrock", "anthropic"],
  openai: ["azure", "openai"],
};

export async function resolveCredential(
  orgId: string,
  family: ApiFamily,
): Promise<ResolvedCredential | null> {
  for (const kind of PRIORITY[family]) {
    const cred = await getProviderCredential(orgId, kind);
    if (cred) return { providerKind: kind, secret: cred.apiKey, baseUrl: cred.baseUrl };
  }
  return null;
}

export type { Adapter, ApiFamily, ProviderKind, ResolvedCredential } from "./types";
