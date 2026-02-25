import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  FICA_REQUIRED_COOKIE_NAME,
  FICA_VERIFIED_COOKIE_NAME,
  SESSION_COOKIE_NAME
} from "@/lib/auth/session";

const protectedPrefixes = [
  "/dashboard",
  "/income-expense",
  "/identity",
  "/debts",
  "/rehab",
  "/help",
  "/fica-verification"
];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  // Why: centralized redirect guard prevents accidental access to protected pages without an active session cookie.
  const sessionValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionValue) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isFicaRoute = pathname.startsWith("/fica-verification");
  const ficaVerified = request.cookies.get(FICA_VERIFIED_COOKIE_NAME)?.value === "1";
  const ficaRequired = request.cookies.get(FICA_REQUIRED_COOKIE_NAME)?.value === "1";

  if (ficaRequired && !ficaVerified && !isFicaRoute) {
    const verifyUrl = new URL("/fica-verification", request.url);
    verifyUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(verifyUrl);
  }

  if (isFicaRoute && (!ficaRequired || ficaVerified)) {
    const target = request.nextUrl.searchParams.get("next");
    const redirectUrl = new URL(target && target.startsWith("/") ? target : "/dashboard", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/income-expense/:path*",
    "/identity/:path*",
    "/debts/:path*",
    "/rehab/:path*",
    "/help/:path*",
    "/fica-verification/:path*"
  ]
};
