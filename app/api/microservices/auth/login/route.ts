import { NextResponse } from "next/server";
import {
  FICA_REQUIRED_COOKIE_NAME,
  FICA_VERIFIED_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildFicaRequiredCookieOptions,
  buildFicaCookieOptions,
  buildSessionCookieOptions
} from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    idNumberOrPassport?: string;
    documentType?: "SA_ID" | "PASSPORT";
    passportCountry?: string | null;
    authIntent?: "join" | "login";
  };
  const authIntent = body.authIntent === "login" ? "login" : "join";
  const result = await callServiceJson("auth", "/auth/login", {
    method: "POST",
    body: JSON.stringify({
      idNumberOrPassport: body.idNumberOrPassport,
      documentType: body.documentType,
      passportCountry: body.passportCountry,
      authIntent
    })
  });

  if (result.status < 200 || result.status >= 300) {
    return NextResponse.json(result.payload, { status: result.status });
  }

  const payload = result.payload as { userId?: string; isFicaVerified?: boolean };
  if (!payload.userId) {
    return NextResponse.json({ message: "Invalid auth response" }, { status: 502 });
  }

  const response = NextResponse.json(result.payload);
  response.cookies.set(SESSION_COOKIE_NAME, payload.userId, buildSessionCookieOptions(60 * 60 * 24 * 7));
  response.cookies.set(
    FICA_VERIFIED_COOKIE_NAME,
    payload.isFicaVerified ? "1" : "0",
    buildFicaCookieOptions(60 * 60 * 24 * 7)
  );
  const ficaRequired = authIntent === "join" && !payload.isFicaVerified ? "1" : "0";
  response.cookies.set(
    FICA_REQUIRED_COOKIE_NAME,
    ficaRequired,
    buildFicaRequiredCookieOptions(60 * 60 * 24 * 7)
  );

  return response;
}
