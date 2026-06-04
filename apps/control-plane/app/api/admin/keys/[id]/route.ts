import { NextResponse } from "next/server";
import { revokeVirtualKey } from "@finops/db";
import { requireAdmin } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Revoke a virtual key. The gateway rejects revoked keys on its next lookup. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    await revokeVirtualKey(id);
    return NextResponse.json({ id, status: "revoked" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
