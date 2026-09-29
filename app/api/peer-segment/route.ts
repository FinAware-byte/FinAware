import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Peer group. Separate from /api/risk-assessment for the same reason as the payment outlook:
// neither feature can break the other.
export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }

  const result = await callServiceJson("financial-api", `/peer-segment/${userId}`, { method: "GET" });
  return NextResponse.json(result.payload, { status: result.status });
}
