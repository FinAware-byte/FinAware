import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import { identityUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await callServiceJson("identity", `/identity/profile/${userId}`, {
    method: "GET"
  });
  return NextResponse.json(result.payload, { status: result.status });
}

export async function PATCH(request: Request) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = identityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid profile payload" }, { status: 400 });
  }

  const downloadPassword =
    typeof (body as { downloadPassword?: unknown }).downloadPassword === "string"
      ? (body as { downloadPassword: string }).downloadPassword
      : "";

  const result = await callServiceJson("identity", `/identity/profile/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...parsed.data, downloadPassword })
  });
  return NextResponse.json(result.payload, { status: result.status });
}
