"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreditsResponse } from "./types";

/** The signed-in user's balance as a small link to /credits; renders nothing when signed out or unavailable. */
export function CreditBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/credits")
      .then((r) => (r.ok ? (r.json() as Promise<CreditsResponse>) : null))
      .then((c) => setBalance(c ? c.balance : null))
      .catch(() => setBalance(null));
  }, []);
  if (balance === null) return null;
  return (
    <Link href="/credits" className="rounded-md border px-2 py-1 text-sm tabular-nums">
      {balance} Credits
    </Link>
  );
}
