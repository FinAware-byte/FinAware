import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { triageRequest } from "@/lib/help/triage";

export const dynamic = "force-dynamic";

// Suggests an advisor for a help request. Nothing is stored; the message is only read.
export async function POST(request: Request) {
  if (!getSessionUserId()) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
  return NextResponse.json(await triageRequest(message));
}
