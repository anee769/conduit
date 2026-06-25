import { NextResponse } from "next/server";
import { computePosture } from "../../../lib/security-posture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public-ish view of the dashboard's enforced security posture (no secrets). */
export async function GET() {
  return NextResponse.json(computePosture());
}
