import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, buildSessionCookieOptions } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", buildSessionCookieOptions(0));
  return response;
}
