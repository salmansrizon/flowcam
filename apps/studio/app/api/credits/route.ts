import { readCredits } from "@/modules/credits/read";

export async function GET() {
  try {
    const credits = await readCredits();
    if (!credits) return Response.json({ error: "Sign in first." }, { status: 401 });
    return Response.json(credits);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
