import { after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueJob, JobError } from "@/modules/ai/jobs";
import { runJob } from "@/modules/ai/worker";

export const runtime = "nodejs";

/** POST { kind, quality, input } -> { id }. 401 signed out, 400 bad input, 402 not enough Credits, 429 over the limits. */
export async function POST(req: Request) {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }
  try {
    const id = await enqueueJob(data.user.id, (body ?? {}) as Record<string, unknown>);
    after(() => runJob(id));
    return Response.json({ id });
  } catch (e) {
    if (e instanceof JobError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
