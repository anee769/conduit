import { NextResponse } from "next/server";
import { listOrgs, createOrg } from "@finops/db";
import { requireAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ orgs: await listOrgs() });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!body?.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const id = await createOrg(String(body.name));
  return NextResponse.json({ id, name: body.name }, { status: 201 });
}
