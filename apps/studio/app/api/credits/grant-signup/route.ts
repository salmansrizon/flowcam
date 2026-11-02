import { grantSignupCredits } from "@/modules/credits/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    return Response.json({ granted: await grantSignupCredits(user.id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
