import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// "What if?" — the same model as /api/risk-assessment, but nothing is stored. Deliberately POST
// rather than GET: the body carries the hypothetical values, and the result must never be cached.
export async function POST(request: Request) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT", message: "Expected a JSON body" }, { status: 400 });
  }

  const result = await callServiceJson("financial-api", `/risk-assessment/${userId}/simulate`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return NextResponse.json(result.payload, { status: result.status });
}
