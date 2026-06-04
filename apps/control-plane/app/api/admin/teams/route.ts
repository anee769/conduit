import { NextResponse } from "next/server";
import { listTeams, createTeam } from "@finops/db";
import { requireAdmin } from "../../../../lib/admin-auth";
import { resolveOrgId } from "../../../../lib/resolve-org";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const orgId = await resolveOrgId(new URL(req.url).searchParams.get("orgId") ?? undefined);
    return NextResponse.json({ teams: await listTeams(orgId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!body?.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  try {
    const orgId = await resolveOrgId(body.orgId);
    const id = await createTeam(orgId, String(body.name), body.costCenter ? String(body.costCenter) : undefined);
    return NextResponse.json({ id, orgId, name: body.name }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
