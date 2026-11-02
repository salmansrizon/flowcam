import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase in server code (route handlers, server actions), signed in as the requesting user from their cookies. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, which cannot set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}
