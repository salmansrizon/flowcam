import { createBrowserClient } from "@supabase/ssr";

/** Supabase in the browser, signed in as the current user (row-level security applies). */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
