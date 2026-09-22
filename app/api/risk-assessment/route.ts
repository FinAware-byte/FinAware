import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }

  const [latest, history] = await Promise.all([
    callServiceJson("financial-api", `/risk-assessment/${userId}/latest`, { method: "GET" }),
    callServiceJson("financial-api", `/risk-assessment/${userId}/history`, { method: "GET" })
  ]);
  if (latest.status !== 200) return NextResponse.json(latest.payload, { status: latest.status });
  return NextResponse.json({
    assessment: (latest.payload as { assessment: unknown }).assessment,
    history: history.status === 200 ? (history.payload as { history: unknown }).history : []
  });
}

// "Request risk assessment" → POST /risk-assessment on the Financial API Service.
export async function POST() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }

  const result = await callServiceJson("financial-api", `/risk-assessment/${userId}`, { method: "POST" });
  return NextResponse.json(result.payload, { status: result.status });
}
