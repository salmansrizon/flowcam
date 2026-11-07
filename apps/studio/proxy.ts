import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProOpen } from "./modules/onboarding/launch";

// Before Pro launches (NEXT_PUBLIC_PRO_LAUNCH_AT): accounts, billing, Credits, Share and AI are closed; the Free Studio is not.
const PRO_ONLY = /^\/(api\/(billing|ai|credits|share)|sign-in|billing|credits|shares|s)(\/|$)/;
// Machine-to-machine callbacks stay reachable: the provider's webhook and the AI worker trigger check their own secrets.
const ALWAYS_OPEN = /^\/api\/(billing\/webhook|ai\/worker)$/;

/**
 * Keeps the Supabase session cookie fresh on every request (the documented @supabase/ssr pattern). Free is
 * local-only and the app stays fully usable signed out (ADR 0005); only Pro routes close before launch.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PRO_ONLY.test(path) && !ALWAYS_OPEN.test(path) && !isProOpen()) {
    return path.startsWith("/api/") ? NextResponse.json({ error: "Pro launches soon." }, { status: 404 }) : NextResponse.redirect(new URL("/", request.url));
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  try {
    await supabase.auth.getClaims(); // refreshes an expired token and writes the cookies via setAll
  } catch {
    // Supabase unreachable: carry on signed out rather than blocking the page.
  }
  return response;
}

export const config = {
  // api/share is the MP4 upload: the proxy would buffer (and cap at 10 MB) its body, and the route reads its own session.
  matcher: ["/((?!api/share$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|onnx|js|mjs)$).*)"],
};
