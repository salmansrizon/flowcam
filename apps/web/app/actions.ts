"use server";

import { featureBySlug } from "@/lib/features";

export type WaitlistState = { status: "idle" | "ok" | "already" | "error"; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ponytail: no rate limiting beyond the honeypot and the unique email; add
// Cloudflare Turnstile here if bots start filling the list.
export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  if (form.get("company")) return { status: "ok", message: "You're on the list." }; // honeypot: quietly drop bots

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const consent = form.get("consent") === "on";
  const rawSource = String(form.get("source") ?? "home");
  const source = rawSource === "home" || featureBySlug(rawSource) ? rawSource : "home";

  if (!EMAIL.test(email) || email.length > 254) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!consent) {
    return { status: "error", message: "Tick the box so we can email you at launch." };
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return { status: "error", message: "The waitlist isn't open yet. Please try again soon." };
  }

  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  // New-style secret keys (sb_secret_…) go only in `apikey`; legacy JWT keys also as a bearer token.
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(`${url}/rest/v1/waitlist`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, source, consent: true }),
    cache: "no-store",
  });

  if (res.status === 409) return { status: "already", message: "You're already on the list. We'll email you at launch." };
  if (!res.ok) return { status: "error", message: "Something went wrong saving your email. Please try again." };
  return { status: "ok", message: "You're on the list. We'll email you the day Flowcam launches." };
}
