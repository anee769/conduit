import { NextResponse } from "next/server";
import { listBudgets, createBudget } from "@finops/db";
import { requireAdmin } from "../../../../lib/admin-auth";
import { resolveOrgId } from "../../../../lib/resolve-org";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const orgId = await resolveOrgId(new URL(req.url).searchParams.get("orgId") ?? undefined);
    return NextResponse.json({ budgets: await listBudgets(orgId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const limitUsd = Number(body?.limitUsd);
  if (!body?.name || !Number.isFinite(limitUsd) || limitUsd <= 0) {
    return NextResponse.json({ error: "name and positive limitUsd are required" }, { status: 400 });
  }
  const period = body.periodType === "daily" ? "daily" : "monthly";
  const action = body.action === "alert" ? "alert" : "block";
  try {
    const orgId = await resolveOrgId(body.orgId);
    const id = await createBudget({
      orgId,
      teamId: body.teamId ? String(body.teamId) : null,
      name: String(body.name),
      periodType: period,
      limitUsd,
      action,
    });
    return NextResponse.json({ id, orgId, limitUsd, periodType: period, action }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
