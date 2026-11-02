import { createHmac, timingSafeEqual } from "node:crypto";

/** Lemon Squeezy signs the raw request body with HMAC-SHA256 and sends the hex digest in `X-Signature`. */
export const sign = (rawBody: string, secret: string) => createHmac("sha256", secret).update(rawBody).digest("hex");

export function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const a = Buffer.from(sign(rawBody, secret));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
