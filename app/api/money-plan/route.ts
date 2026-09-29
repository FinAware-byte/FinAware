import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET returns the plan; PUT saves the essential expenses it is built from.
export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }
  const result = await callServiceJson("financial-api", `/money-plan/${userId}`, { method: "GET" });
  return NextResponse.json(result.payload, { status: result.status });
}

export async function PUT(request: Request) {
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

  const saved = await callServiceJson("financial-api", `/budget/${userId}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
  if (saved.status !== 200) {
    return NextResponse.json(saved.payload, { status: saved.status });
  }

  // Return the recalculated plan straight away, so saving and seeing the result is one round trip.
  const plan = await callServiceJson("financial-api", `/money-plan/${userId}`, { method: "GET" });
  return NextResponse.json(plan.payload, { status: plan.status });
}
