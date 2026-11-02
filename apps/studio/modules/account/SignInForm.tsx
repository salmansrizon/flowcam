"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase/client";
import { safeNext } from "./next";

const COOLDOWN_SECONDS = 60;

/**
 * Email one-time-code sign-in: ask for an email, then for the code sent to it. The code length is a Supabase Auth
 * setting (6 to 8 digits), so accept any of them.
 */
export function SignInForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
    setCode("");
    setCooldown(COOLDOWN_SECONDS);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      return setError("That code is wrong or has expired. Check it and try again, or send a new one.");
    }
    // Full navigation so the server sees the new session cookie; safeNext allows same-origin paths only.
    window.location.assign(safeNext(next));
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (sent ? verify() : sendCode());
      }}
    >
      {!sent ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">One-time code</Label>
          <p className="text-sm text-muted-foreground">We sent a code to {email}.</p>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={8} pattern="[0-9]{6,8}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="tracking-[0.4em]" />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || (sent && code.length < 6)}>
        {sent ? "Verify code" : "Email me a code"}
      </Button>
      {sent && (
        <div className="flex items-center justify-between text-sm">
          <Button type="button" variant="ghost" size="sm" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </Button>
          <Button type="button" variant="link" size="sm" onClick={() => { setSent(false); setError(null); }}>
            Use a different email
          </Button>
        </div>
      )}
    </form>
  );
}
