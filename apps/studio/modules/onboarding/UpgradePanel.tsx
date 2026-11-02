"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProBadge } from "./ProBadge";
import { foundingOpen, money, type Pricing } from "./pricing";
import { loadPricing } from "./loadPricing";

/** Explains one Pro feature and the plan. Prices come from the `pricing` table; if that is unusable, no numbers are shown. */
export function UpgradePanel({ feature, benefit, open, onOpenChange }: { feature: string; benefit: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{feature} <ProBadge /></DialogTitle>
          <DialogDescription>{benefit}</DialogDescription>
        </DialogHeader>
        {open && <PricingBody />}
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">Billing is coming soon</span>
          <Button disabled>Start Trial</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the panel is open, so each opening loads the prices afresh. */
function PricingBody() {
  const [pricing, setPricing] = useState<Pricing | null | undefined>(undefined); // undefined while loading
  useEffect(() => {
    let live = true;
    void loadPricing().then((p) => live && setPricing(p));
    return () => {
      live = false;
    };
  }, []);
  if (pricing === undefined) return <p className="text-sm text-muted-foreground">Loading plans…</p>;
  if (pricing === null) return <p role="status" className="text-sm text-muted-foreground">Pricing is not available right now</p>;
  return <Plans p={pricing} />;
}

function Plans({ p }: { p: Pricing }) {
  const m = (c: number) => money(c, p.currency);
  return (
    <div className="grid gap-3 text-sm">
      <p>
        <strong>{p.trialDays}-day Trial</strong> with {p.trialCredits} Credits. Card required.
      </p>
      {foundingOpen(p) && (
        <p className="rounded-md bg-muted px-3 py-2">
          <strong>Founding Price:</strong> {m(p.foundingMonthlyCents)}/month or {m(p.foundingYearlyCents)}/year for early subscribers (first {p.foundingMaxSubscribers}).
        </p>
      )}
      <table aria-label="Compare plans" className="w-full text-left">
        <thead>
          <tr className="text-muted-foreground"><th className="font-medium">Compare plans</th><th className="font-medium">Free</th><th className="font-medium">Pro</th></tr>
        </thead>
        <tbody>
          <tr><td>Price</td><td>{m(0)}</td><td>{m(p.listMonthlyCents)}/month or {m(p.listYearlyCents)}/year</td></tr>
          <tr><td>Credits</td><td>None</td><td>{p.monthlyCredits}/month</td></tr>
          <tr><td>Extras</td><td>This device only</td><td>Sync, Share, 4K</td></tr>
        </tbody>
      </table>
    </div>
  );
}
