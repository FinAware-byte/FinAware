import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "finaware_session";

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

export { SESSION_COOKIE_NAME, buildSessionCookieOptions };
