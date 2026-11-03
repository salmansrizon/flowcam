import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/studio/TopBar";
import { Panel } from "@/components/studio/Panel";
import { supabaseServer } from "@/lib/supabase/server";
import { billing } from "@/modules/billing/billing";
import { CancelDemoButton } from "@/modules/billing/BillingButtons";
import { planLabel } from "@/modules/account/plan";

export const metadata: Metadata = { title: "Billing · Flowcam Studio" };

/** The demo billing page: plan status and Cancel. With a real provider, "Manage billing" goes to its portal instead. */
export default async function BillingPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: sub } = user ? await supabase.from("subscriptions").select("plan,status,current_period_end,cancel_at_period_end").maybeSingle() : { data: null };
  const plan = planLabel(sub);
  const isDemo = billing().name === "demo";
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar><h1 className="text-sm font-medium">Billing</h1></TopBar>
      <main className="mx-auto w-full max-w-md space-y-4 p-4">
        <Panel className="space-y-3 p-6">
          {!user ? (
            <p>Sign in to manage billing.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Your plan</p>
              <p className="text-2xl font-semibold" data-testid="billing-plan">{plan}</p>
              {sub && plan !== "Free" && (
                <p className="text-sm text-muted-foreground">
                  {sub.cancel_at_period_end ? "Cancels on " : "Renews on "}
                  {new Date(sub.current_period_end).toLocaleDateString()}
                </p>
              )}
              {isDemo && plan !== "Free" && !sub?.cancel_at_period_end && <CancelDemoButton />}
              {isDemo && sub?.cancel_at_period_end && <p className="text-sm">Cancelled: you keep {plan} until the date above.</p>}
            </>
          )}
          <Link href="/" className="inline-block text-sm underline">Back to the studio</Link>
        </Panel>
      </main>
    </div>
  );
}
