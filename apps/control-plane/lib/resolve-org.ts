import { getFirstOrg } from "@finops/db";

/**
 * Resolve the org an admin write targets: an explicit `orgId` in the body, else
 * the single on-prem org. Throws if neither exists (caller must create an org).
 */
export async function resolveOrgId(bodyOrgId?: unknown): Promise<string> {
  if (typeof bodyOrgId === "string" && bodyOrgId) return bodyOrgId;
  const org = await getFirstOrg();
  if (!org) throw new Error("no organization exists — create one first (POST /api/admin/orgs)");
  return org.id;
}
