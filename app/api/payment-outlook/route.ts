import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Missed-payment outlook. Separate from /api/risk-assessment so that neither feature can break
// the other: this model is trained on a recorded outcome, the risk tier on a constructed target.
export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }

  const result = await callServiceJson("financial-api", `/payment-outlook/${userId}`, { method: "GET" });
  return NextResponse.json(result.payload, { status: result.status });
}
