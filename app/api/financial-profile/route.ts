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

  const result = await callServiceJson("financial-api", `/financial-profile/${userId}`, { method: "GET" });
  return NextResponse.json(result.payload, { status: result.status });
}

// Why: validation is done by the Financial API Service (the authority in the sequence diagram), which
// returns field-level errors for the form; this route only authenticates and forwards.
export async function PUT(request: Request) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const result = await callServiceJson("financial-api", `/financial-profile/${userId}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
  return NextResponse.json(result.payload, { status: result.status });
}
