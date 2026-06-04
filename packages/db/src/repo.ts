import { and, eq } from "drizzle-orm";
import { db } from "./client";
import {
  organizations,
  teams,
  providerCredentials,
  virtualKeys,
  type VirtualKey,
} from "./schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { generateVirtualKey, hashKey } from "./keys";

// ── Admin / setup operations (used by the CLI now, the M4 wizard later) ──────

export async function createOrg(name: string): Promise<string> {
  const [row] = await db
    .insert(organizations)
    .values({ name })
    .returning({ id: organizations.id });
  return row!.id;
}

export async function createTeam(
  orgId: string,
  name: string,
  costCenter?: string,
): Promise<string> {
  const [row] = await db
    .insert(teams)
    .values({ orgId, name, costCenter })
    .returning({ id: teams.id });
  return row!.id;
}

export async function addProviderCredential(args: {
  orgId: string;
  provider: string;
  displayName: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<string> {
  const [row] = await db
    .insert(providerCredentials)
    .values({
      orgId: args.orgId,
      provider: args.provider,
      displayName: args.displayName,
      encryptedKey: encryptSecret(args.apiKey),
      baseUrl: args.baseUrl,
    })
    .returning({ id: providerCredentials.id });
  return row!.id;
}

export async function createVirtualKey(args: {
  orgId: string;
  teamId?: string;
  name: string;
  allowedModels?: string[];
  rateLimitRpm?: number | null;
}): Promise<{ id: string; token: string }> {
  const key = generateVirtualKey();
  const [row] = await db
    .insert(virtualKeys)
    .values({
      orgId: args.orgId,
      teamId: args.teamId ?? null,
      name: args.name,
      keyPrefix: key.prefix,
      keyHash: key.hash,
      allowedModels: args.allowedModels ?? null,
      rateLimitRpm: args.rateLimitRpm ?? null,
    })
    .returning({ id: virtualKeys.id });
  return { id: row!.id, token: key.token };
}

// ── Gateway hot-path operations ──────────────────────────────────────────────

/** Look up a virtual key by its presented token. Returns null if unknown. */
export async function lookupVirtualKey(token: string): Promise<VirtualKey | null> {
  const [row] = await db
    .select()
    .from(virtualKeys)
    .where(eq(virtualKeys.keyHash, hashKey(token)))
    .limit(1);
  return row ?? null;
}

/** Resolve + decrypt the provider credential for an org. Null if none/disabled. */
export async function getProviderCredential(
  orgId: string,
  provider: string,
): Promise<{ apiKey: string; baseUrl: string | null } | null> {
  const [row] = await db
    .select()
    .from(providerCredentials)
    .where(
      and(
        eq(providerCredentials.orgId, orgId),
        eq(providerCredentials.provider, provider),
        eq(providerCredentials.enabled, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { apiKey: decryptSecret(row.encryptedKey), baseUrl: row.baseUrl };
}

/** Best-effort update of last-used timestamp (non-blocking on the hot path). */
export async function touchVirtualKeyLastUsed(id: string): Promise<void> {
  await db
    .update(virtualKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(virtualKeys.id, id));
}

// ── Admin/list operations (control-plane admin API + setup wizard) ───────────

export async function listOrgs() {
  return db.select().from(organizations).orderBy(organizations.createdAt);
}

/** First org by creation — the single on-prem tenant in the common case. */
export async function getFirstOrg() {
  const [row] = await db.select().from(organizations).orderBy(organizations.createdAt).limit(1);
  return row ?? null;
}

export async function listTeams(orgId: string) {
  return db.select().from(teams).where(eq(teams.orgId, orgId));
}

/** Virtual keys WITHOUT the secret hash — safe to return to the UI. */
export async function listVirtualKeys(orgId: string) {
  return db
    .select({
      id: virtualKeys.id,
      name: virtualKeys.name,
      keyPrefix: virtualKeys.keyPrefix,
      teamId: virtualKeys.teamId,
      allowedModels: virtualKeys.allowedModels,
      rateLimitRpm: virtualKeys.rateLimitRpm,
      status: virtualKeys.status,
      createdAt: virtualKeys.createdAt,
      lastUsedAt: virtualKeys.lastUsedAt,
    })
    .from(virtualKeys)
    .where(eq(virtualKeys.orgId, orgId));
}

/** Provider credentials WITHOUT the encrypted key — never expose the secret. */
export async function listProviderCredentials(orgId: string) {
  return db
    .select({
      id: providerCredentials.id,
      provider: providerCredentials.provider,
      displayName: providerCredentials.displayName,
      baseUrl: providerCredentials.baseUrl,
      enabled: providerCredentials.enabled,
      createdAt: providerCredentials.createdAt,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.orgId, orgId));
}

/** Revoke a virtual key (sets status='revoked'; the gateway then rejects it). */
export async function revokeVirtualKey(id: string): Promise<void> {
  await db.update(virtualKeys).set({ status: "revoked" }).where(eq(virtualKeys.id, id));
}
