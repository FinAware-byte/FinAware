import { NextResponse } from "next/server";
import {
  FICA_REQUIRED_COOKIE_NAME,
  FICA_VERIFIED_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildFicaRequiredCookieOptions,
  buildFicaCookieOptions,
  buildSessionCookieOptions
} from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", buildSessionCookieOptions(0));
  response.cookies.set(FICA_VERIFIED_COOKIE_NAME, "", buildFicaCookieOptions(0));
  response.cookies.set(FICA_REQUIRED_COOKIE_NAME, "", buildFicaRequiredCookieOptions(0));
  return response;
}
