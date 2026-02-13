import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(value: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(value: string, hashed: string): boolean {
  const [salt, originalHash] = hashed.split(":");
  if (!salt || !originalHash) return false;

  const computed = scryptSync(value, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(originalHash, "hex"));
}
