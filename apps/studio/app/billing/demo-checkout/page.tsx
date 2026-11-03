import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/studio/TopBar";
import { Panel } from "@/components/studio/Panel";
import { supabaseServer } from "@/lib/supabase/server";
import { billing, loadPricingServer, readDemoSession } from "@/modules/billing/billing";
import { PayDemoButton } from "@/modules/billing/BillingButtons";
import { money, proPriceCents } from "@/modules/onboarding/pricing";

export const metadata: Metadata = { title: "Checkout (demo) · Flowcam Studio" };

export default async function DemoCheckoutPage({ searchParams }: { searchParams: Promise<{ session?: string | string[] }> }) {
  const { session } = await searchParams; // first, so this page is never prerendered at build
  if (billing().name !== "demo") notFound();
  const token = Array.isArray(session) ? session[0] : session;
  const s = readDemoSession(token);
  const { data } = await (await supabaseServer()).auth.getUser();
  const pricing = await loadPricingServer();
  const ok = s && data.user?.id === s.uid && pricing;
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar><h1 className="text-sm font-medium">Checkout (demo)</h1></TopBar>
      <main className="mx-auto w-full max-w-md space-y-4 p-4">
        {!ok ? (
          <Panel className="p-6">
            <p className="font-medium">This checkout is not available</p>
            <p className="mt-1 text-sm text-muted-foreground">It may have expired, or you are signed in as someone else.</p>
            <Link href="/" className="mt-3 inline-block text-sm underline">Back to the studio</Link>
          </Panel>
        ) : (
          <Panel className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">Demo payment: no card is charged.</p>
            {s.kind === "topup" && (
              <p data-testid="item"><strong>Top-up</strong>: {pricing.topupCredits} Credits for {money(pricing.topupCents, pricing.currency)}</p>
            )}
            {s.kind === "trial" && (
              <p data-testid="item"><strong>{pricing.trialDays}-day Trial</strong> with {pricing.trialCredits} Credits, then {money(proPriceCents(pricing, "month"), pricing.currency)}/month</p>
            )}
            {s.kind === "pro" && (
              <p data-testid="item"><strong>Pro, {s.interval === "year" ? "yearly" : "monthly"}</strong>: {money(proPriceCents(pricing, s.interval ?? "month"), pricing.currency)}/{s.interval === "year" ? "year" : "month"}</p>
            )}
            <PayDemoButton session={token!} />
          </Panel>
        )}
      </main>
    </div>
  );
}
