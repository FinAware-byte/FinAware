import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "finaware_session";
const FICA_VERIFIED_COOKIE_NAME =
  process.env.FICA_VERIFIED_COOKIE_NAME ?? "finaware_fica_verified";
const FICA_REQUIRED_COOKIE_NAME =
  process.env.FICA_REQUIRED_COOKIE_NAME ?? "finaware_fica_required";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

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

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters in production.");
  }
  return "finaware-local-development-session-secret-change-before-deployment";
}

export function createSessionCookieValue(userId: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSessionCookieValue(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const [userId, expiryText, signature, extra] = value.split(".");
  if (!userId || !expiryText || !signature || extra !== undefined || !/^[1-9][0-9]*$/.test(userId)) {
    return null;
  }
  const expiresAt = Number(expiryText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return null;
  const payload = `${userId}.${expiryText}`;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return userId;
}

export function getSessionUserId(): string | null {
  return readSessionCookieValue(cookies().get(SESSION_COOKIE_NAME)?.value);
}

export function setSessionUserId(userId: string): void {
  // Why: the httpOnly cookie contains a signed, expiring token rather than a guessable database ID.
  cookies().set(SESSION_COOKIE_NAME, createSessionCookieValue(userId), buildSessionCookieOptions(SESSION_TTL_SECONDS));
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
