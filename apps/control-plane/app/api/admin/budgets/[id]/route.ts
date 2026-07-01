import { NextResponse } from "next/server";
import { deleteBudget } from "@finops/db";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { reloadGateway } from "../../../../../lib/gateway-reload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await deleteBudget(id);
    void reloadGateway();
    return NextResponse.json({ id, deleted: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
