/** Browser side: ask the server for a checkout URL and go there. Signed out goes to sign-in and comes back. Returns an error message, or null if navigating. */
export async function startCheckout(body: { kind: "trial" | "pro"; interval: "month" | "year" } | { kind: "topup" }): Promise<string | null> {
  const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load keeps the session cookie flow simple
    window.location.assign(`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return null;
  }
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !j.url) return j.error ?? "Could not start checkout.";
  window.location.assign(j.url);
  return null;
}

/** Opens the billing portal (Lemon Squeezy's, or the local /billing page in demo mode). */
export async function openPortal(): Promise<void> {
  const j = (await (await fetch("/api/billing/portal")).json().catch(() => ({}))) as { url?: string };
  if (j.url) window.location.assign(j.url);
}
