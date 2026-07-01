import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { getBudgetStatus } from "../../../../../lib/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const budgets = await getBudgetStatus();
    return NextResponse.json({ budgets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
