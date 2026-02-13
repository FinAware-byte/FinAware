import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await callServiceJson("dashboard", `/dashboard/overview/${userId}`, {
    method: "GET"
  });
  return NextResponse.json(result.payload, { status: result.status });
}
