import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** "salt:hash" (hex), scrypt with a random salt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
