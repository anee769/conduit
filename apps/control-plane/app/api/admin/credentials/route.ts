import { NextResponse } from "next/server";
import { listProviderCredentials, addProviderCredential } from "@finops/db";
import { requireAdmin } from "../../../../lib/admin-auth";
import { resolveOrgId } from "../../../../lib/resolve-org";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROVIDERS = new Set(["openai", "anthropic", "azure"]);

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const orgId = await resolveOrgId(new URL(req.url).searchParams.get("orgId") ?? undefined);
    // listProviderCredentials never returns the encrypted key.
    return NextResponse.json({ credentials: await listProviderCredentials(orgId) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!PROVIDERS.has(body?.provider)) {
    return NextResponse.json({ error: "provider must be openai|anthropic|azure" }, { status: 400 });
  }
  if (!body?.apiKey) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  try {
    const orgId = await resolveOrgId(body.orgId);
    const id = await addProviderCredential({
      orgId,
      provider: String(body.provider),
      displayName: String(body.displayName ?? body.provider),
      apiKey: String(body.apiKey), // encrypted at rest; never returned
      baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
    });
    // Note: the response intentionally omits the key.
    return NextResponse.json({ id, orgId, provider: body.provider }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
