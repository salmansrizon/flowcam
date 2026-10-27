import "server-only";
import type { CreditsResponse } from "./types";
import { supabaseServer } from "@/lib/supabase/server";

/** The signed-in user's Credits, read through row-level security (their own lines only). Null when signed out. */
export async function readCredits(): Promise<CreditsResponse | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("credit_ledger").select("id, kind, bucket, amount, note, created_at").order("id", { ascending: false });
  if (error) throw new Error(error.message);
  const byBucket: Record<string, number> = {};
  let balance = 0;
  for (const l of data) {
    balance += l.amount;
    byBucket[l.bucket] = (byBucket[l.bucket] ?? 0) + l.amount;
  }
  // ponytail: reads every line to sum; add a read-only balance view if histories get long.
  return { balance, byBucket, lines: data.slice(0, 50) };
}
