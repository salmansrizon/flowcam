"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { isProOpen, WAITLIST_URL } from "./launch";

// Re-checked each minute, so a tab left open across the launch opens Pro without a reload.
const everyMinute = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};

/**
 * isProOpen on this device's clock; null while hydrating, so the server's render never disagrees with the client's.
 * The server (proxy.ts) decides on its own clock; a wrong device clock only changes which buttons show.
 */
export function useProOpen(): boolean | null {
  return useSyncExternalStore(everyMinute, () => isProOpen(), () => null);
}

/** Shown instead of Start Trial, sign-in and AI before Pro launches. */
export function ProSoonLink() {
  return (
    <Button asChild>
      <a href={WAITLIST_URL}>Get notified</a>
    </Button>
  );
}
