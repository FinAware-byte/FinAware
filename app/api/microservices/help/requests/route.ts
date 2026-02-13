import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import { consultationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await callServiceJson("help", `/help/requests/${userId}`, {
    method: "GET"
  });
  return NextResponse.json(result.payload, { status: result.status });
}

export async function POST(request: Request) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const json = (await request.json()) as unknown;
  const parsed = consultationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const result = await callServiceJson("help", `/help/requests/${userId}`, {
    method: "POST",
    body: JSON.stringify(parsed.data)
  });
  return NextResponse.json(result.payload, { status: result.status });
}
