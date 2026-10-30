import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(value: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(value: string, hashed: string): boolean {
  const [salt, originalHash] = hashed.split(":");
  if (!salt || !originalHash) return false;

  const computed = Buffer.from(scryptSync(value, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(originalHash, "hex");
  if (computed.length !== expected.length || computed.length === 0) return false;
  return timingSafeEqual(computed, expected);
}
