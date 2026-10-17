"use client";
import { useState } from "react";

export function PricingToggle() {
  const [yearly, setYearly] = useState(false);
  const opt = (on: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-green text-white" : "text-ink-soft"}`;
  return (
    <div>
      <div className="inline-flex gap-1 rounded-full border border-line bg-sky-50 p-1">
        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className={opt(!yearly)}>Monthly</button>
        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className={opt(yearly)}>Yearly</button>
      </div>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="text-5xl font-extrabold text-ink">{yearly ? "$170" : "$17"}</span>
        <span className="text-muted">{yearly ? "/yr" : "/mo"}</span>
        <s className="text-lg text-muted">{yearly ? "$200" : "$20"}</s>
      </p>
      <p className="mt-1 text-sm text-ink-soft">Founding price, locked in for as long as you stay subscribed</p>
    </div>
  );
}
