import { supabaseBrowser } from "@/lib/supabase/client";
import { parsePricing, type Pricing } from "./pricing";

/** The active pricing row, or null if it is missing, unreadable or invalid. */
export async function loadPricing(): Promise<Pricing | null> {
  try {
    const { data, error } = await supabaseBrowser().from("pricing").select("*").eq("active", true).maybeSingle();
    return error ? null : parsePricing(data);
  } catch {
    return null;
  }
}
