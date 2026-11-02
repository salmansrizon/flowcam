"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startCheckout } from "./client";

/** A button that runs `action`, shows its error, and stays disabled while busy. `action` returns an error message or null. */
function ActionButton({ label, busyLabel, action, variant }: { label: string; busyLabel?: string; action: () => Promise<string | null>; variant?: "outline" | "destructive" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const e = await action();
            if (e) setError(e);
            else return; // Navigating away.
          } catch {
            setError("Something went wrong. Try again.");
          }
          setBusy(false);
        }}
      >
        {busy ? (busyLabel ?? "Working…") : label}
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

export const TopupButton = ({ label }: { label: string }) => <ActionButton label={label} variant="outline" action={() => startCheckout({ kind: "topup" })} />;

export const StartTrialButton = () => <ActionButton label="Start Trial" action={() => startCheckout({ kind: "trial", interval: "month" })} />;

export function PayDemoButton({ session }: { session: string }) {
  return (
    <ActionButton
      label="Pay (demo)"
      busyLabel="Paying…"
      action={async () => {
        const res = await fetch("/api/billing/demo-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session }) });
        const j = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
        if (!res.ok || !j.next) return j.error ?? "Payment failed.";
        window.location.assign(j.next);
        return null;
      }}
    />
  );
}

export function CancelDemoButton() {
  return (
    <ActionButton
      label="Cancel subscription"
      variant="destructive"
      action={async () => {
        const res = await fetch("/api/billing/cancel", { method: "POST" });
        if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not cancel.";
        window.location.reload();
        return null;
      }}
    />
  );
}
