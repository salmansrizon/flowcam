"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { planLabel, type PlanLabel } from "../account/plan";

/** The signed-in user's Plan, "out" when signed out, null while loading. Read like the account menu does (own row, RLS). */
export function usePlan(): PlanLabel | "out" | null {
  const [plan, setPlan] = useState<PlanLabel | "out" | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data } = await supabase.auth.getUser();
        if (!data.user) return live && setPlan("out");
        const { data: sub } = await supabase.from("subscriptions").select("plan,status,current_period_end").maybeSingle();
        if (live) setPlan(planLabel(sub));
      } catch {
        if (live) setPlan("out");
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return plan;
}

/** Pro and Trial users have Pro features, so they never see upsells. */
export const hasPro = (plan: PlanLabel | "out" | null) => plan === "Pro" || plan === "Trial";
