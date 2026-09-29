import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Recalculates the plan for the figures being typed. Nothing is saved here — the PUT on
// /api/money-plan is the only thing that writes.
export async function POST(request: Request) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT", message: "Expected a JSON body" }, { status: 400 });
  }

  const result = await callServiceJson("financial-api", `/money-plan/${userId}/preview`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return NextResponse.json(result.payload, { status: result.status });
}
