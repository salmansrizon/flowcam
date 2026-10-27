import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase with the secret key: bypasses row-level security. Server code only, for writes users must not make
 * themselves (plans, Credit grants). Never import this into client code.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set (see apps/studio/.env.example).");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
