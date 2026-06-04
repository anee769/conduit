import { NextResponse } from "next/server";
import { listVirtualKeys, createVirtualKey } from "@finops/db";
import { requireAdmin } from "../../../../lib/admin-auth";
import { resolveOrgId } from "../../../../lib/resolve-org";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const orgId = await resolveOrgId(new URL(req.url).searchParams.get("orgId") ?? undefined);
    return NextResponse.json({ keys: await listVirtualKeys(orgId) }); // no secret hash
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
    const allowedModels = Array.isArray(body.allowedModels) ? body.allowedModels.map(String) : undefined;
    const rateLimitRpm =
      body.rateLimitRpm != null && Number.isFinite(Number(body.rateLimitRpm))
        ? Number(body.rateLimitRpm)
        : undefined;
    const { id, token } = await createVirtualKey({
      orgId,
      teamId: body.teamId ? String(body.teamId) : undefined,
      name: String(body.name),
      allowedModels,
      rateLimitRpm,
    });
    // `token` is shown ONCE — the server only stores its hash.
    return NextResponse.json({ id, name: body.name, virtualKey: token }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
