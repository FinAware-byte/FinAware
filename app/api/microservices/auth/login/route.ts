import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, buildSessionCookieOptions } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { idNumberOrPassport?: string };
  const result = await callServiceJson("auth", "/auth/login", {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (result.status < 200 || result.status >= 300) {
    return NextResponse.json(result.payload, { status: result.status });
  }

  const payload = result.payload as { userId?: string };
  if (!payload.userId) {
    return NextResponse.json({ message: "Invalid auth response" }, { status: 502 });
  }

  const response = NextResponse.json(result.payload);
  response.cookies.set(SESSION_COOKIE_NAME, payload.userId, buildSessionCookieOptions(60 * 60 * 24 * 7));

  return response;
}
