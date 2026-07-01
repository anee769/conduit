import { NextResponse } from "next/server";
import { renameOrg } from "@finops/db";
import { requireAdmin } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body?.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  try {
    await renameOrg(id, String(body.name));
    return NextResponse.json({ id, name: body.name });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
