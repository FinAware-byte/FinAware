import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "finaware_session";
const FICA_VERIFIED_COOKIE_NAME =
  process.env.FICA_VERIFIED_COOKIE_NAME ?? "finaware_fica_verified";
const FICA_REQUIRED_COOKIE_NAME =
  process.env.FICA_REQUIRED_COOKIE_NAME ?? "finaware_fica_required";

function isSessionCookieSecure(): boolean {
  const override = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

function buildSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: isSessionCookieSecure(),
    path: "/",
    maxAge
  };
}

function buildFicaCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: isSessionCookieSecure(),
    path: "/",
    maxAge
  };
}

function buildFicaRequiredCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: isSessionCookieSecure(),
    path: "/",
    maxAge
  };
}

export function getSessionUserId(): string | null {
  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function setSessionUserId(userId: string): void {
  // Why: httpOnly + strict sameSite reduces script access and cross-site leakage for the session identifier.
  cookies().set(SESSION_COOKIE_NAME, userId, buildSessionCookieOptions(60 * 60 * 24 * 7));
}

export function clearSessionUserId(): void {
  cookies().set(SESSION_COOKIE_NAME, "", buildSessionCookieOptions(0));
}

export function getFicaVerifiedCookie(): string | null {
  return cookies().get(FICA_VERIFIED_COOKIE_NAME)?.value ?? null;
}

export function setFicaVerifiedCookie(value: "0" | "1"): void {
  cookies().set(FICA_VERIFIED_COOKIE_NAME, value, buildFicaCookieOptions(60 * 60 * 24 * 7));
}

export function clearFicaVerifiedCookie(): void {
  cookies().set(FICA_VERIFIED_COOKIE_NAME, "", buildFicaCookieOptions(0));
}

export function getFicaRequiredCookie(): string | null {
  return cookies().get(FICA_REQUIRED_COOKIE_NAME)?.value ?? null;
}

export function setFicaRequiredCookie(value: "0" | "1"): void {
  cookies().set(
    FICA_REQUIRED_COOKIE_NAME,
    value,
    buildFicaRequiredCookieOptions(60 * 60 * 24 * 7)
  );
}

export function clearFicaRequiredCookie(): void {
  cookies().set(FICA_REQUIRED_COOKIE_NAME, "", buildFicaRequiredCookieOptions(0));
}

export {
  SESSION_COOKIE_NAME,
  FICA_VERIFIED_COOKIE_NAME,
  FICA_REQUIRED_COOKIE_NAME,
  buildSessionCookieOptions,
  buildFicaCookieOptions,
  buildFicaRequiredCookieOptions
};
