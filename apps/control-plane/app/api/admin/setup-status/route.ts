import { NextResponse } from "next/server";
import { getFirstOrg, listTeams, listVirtualKeys, listProviderCredentials, listBudgets } from "@finops/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Drives the first-run wizard: which setup steps are done, and the per-entity
 * counts. `empty` = a brand-new install with no org yet.
 *
 * INTENTIONALLY UNAUTHENTICATED. This is a benign read used by the wizard
 * BEFORE any admin token / dashboard cookie could exist (chicken-and-egg with
 * first-run). It returns only counts + entity ids + the org name — no
 * secrets, no credential values, no virtual key tokens. If a fresh visitor
 * hits the endpoint they learn "this install has N orgs / M teams"; that's
 * not sensitive at the altitude of an on-prem self-hosted dashboard.
 */
export async function GET() {
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
