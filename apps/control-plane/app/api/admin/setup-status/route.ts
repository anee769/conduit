import { NextResponse } from "next/server";
import { getFirstOrg, listTeams, listVirtualKeys, listProviderCredentials, listBudgets } from "@finops/db";
import { requireAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Drives the first-run wizard: which setup steps are done, and the per-entity
 * counts. `empty` = a brand-new install with no org yet.
 */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const org = await getFirstOrg();
    if (!org) {
      return NextResponse.json({
        empty: true,
        org: null,
        counts: { teams: 0, virtualKeys: 0, providerCredentials: 0, budgets: 0 },
        steps: { org: false, credential: false, team: false, virtualKey: false },
      });
    }
    const [teams, keys, creds, budgets] = await Promise.all([
      listTeams(org.id),
      listVirtualKeys(org.id),
      listProviderCredentials(org.id),
      listBudgets(org.id),
    ]);
    return NextResponse.json({
      empty: false,
      org: { id: org.id, name: org.name },
      counts: {
        teams: teams.length,
        virtualKeys: keys.length,
        providerCredentials: creds.length,
        budgets: budgets.length,
      },
      steps: {
        org: true,
        credential: creds.length > 0,
        team: teams.length > 0,
        virtualKey: keys.length > 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
