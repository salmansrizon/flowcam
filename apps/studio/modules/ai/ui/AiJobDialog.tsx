"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiError, clearPending, formatPrice, loadPending, savePending, startJob, useAiPrices, waitForJob, type JobStatus } from "../client";
import type { AiJobIO, AiJobKind, AiQuality } from "../types";

type Phase = { t: "idle" } | { t: "running"; status: JobStatus | "starting" } | { t: "error"; err: Error } | { t: "preview"; result: unknown; ctx?: string };

const STATUS_LABEL: Record<JobStatus | "starting", string> = { starting: "queued", queued: "queued", running: "generating", succeeded: "done", failed: "failed" };

/** The shown reason a Job could not run: sign in (401), out of Credits (402), or the server's message. */
export function AiErrorMessage({ err }: { err: Error }) {
  const status = err instanceof AiError ? err.status : 0;
  if (status === 401) {
    const next = typeof window === "undefined" ? "/" : window.location.pathname;
    return (
      <p role="alert" className="text-sm">
        <Link className="font-medium underline" href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in to use AI</Link>. No account is needed for anything else.
      </p>
    );
  }
  if (status === 402) {
    return (
      <p role="alert" className="text-sm text-destructive">
        You are out of Credits. <Link className="font-medium underline" href="/credits">Get more Credits</Link>.
      </p>
    );
  }
  return <p role="alert" className="text-sm text-destructive">{status ? err.message : `failed: ${err.message}`}</p>;
}

type Props<K extends AiJobKind> = {
  kind: K;
  /** Names the pending-Job slot in localStorage, so a reload resumes this feature's Job. */
  feature: string;
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The feature's own inputs. */
  children?: ReactNode;
  /** Why Generate cannot run yet (empty prompt, empty Script...); shown and disables Generate. */
  blocked?: string;
  input: AiJobIO[K]["input"];
  /** Stored with the pending Job and handed back to `onResult`; a Job resumes only where `ctx` matches. */
  ctx?: string;
  /** With `preview`, the result is shown for approval; otherwise `onResult` runs as soon as it arrives. */
  preview?: (result: AiJobIO[K]["result"]) => ReactNode;
  onResult: (result: AiJobIO[K]["result"], ctx?: string) => void | Promise<void>;
  applyLabel?: string;
};

/** Quality choice with its Credit price, Generate, progress and errors, shared by every AI feature. */
export function AiJobDialog<K extends AiJobKind>(p: Props<K>) {
  const prices = useAiPrices(p.open);
  const [quality, setQuality] = useState<AiQuality>("standard");
  const [phase, setPhase] = useState<Phase>({ t: "idle" });
  const resumed = useRef(false);
  const latest = useRef(p);
  useEffect(() => {
    latest.current = p;
  });
  const busy = phase.t === "running";

  async function settle(id: string, ctx?: string) {
    setPhase({ t: "running", status: "queued" });
    try {
      const result = await waitForJob<K>(id, (s) => setPhase({ t: "running", status: s }));
      clearPending(p.feature);
      if (latest.current.preview) return setPhase({ t: "preview", result, ctx });
      await latest.current.onResult(result, ctx);
      setPhase({ t: "idle" });
      latest.current.onOpenChange(false);
    } catch (e) {
      // A client-side timeout (504) means the Job is still running on the server and will still be charged:
      // keep it pending so reopening or reloading picks up the result.
      if (!(e instanceof AiError && e.status === 504)) clearPending(p.feature);
      setPhase({ t: "error", err: e instanceof Error ? e : new Error(String(e)) });
    }
  }

  async function generate() {
    setPhase({ t: "running", status: "starting" });
    try {
      const id = await startJob(p.kind, quality, p.input);
      savePending(p.feature, { id, ctx: p.ctx });
      await settle(id, p.ctx);
    } catch (e) {
      setPhase({ t: "error", err: e instanceof Error ? e : new Error(String(e)) });
    }
  }

  // A Job that was running when the page reloaded: reopen the dialog and keep polling.
  useEffect(() => {
    if (resumed.current) return;
    const pending = loadPending(p.feature);
    if (!pending || (pending.ctx !== undefined && pending.ctx !== p.ctx)) return;
    resumed.current = true;
    // Deferred so the state updates are not synchronous in the effect.
    void Promise.resolve().then(() => {
      p.onOpenChange(true);
      return settle(pending.id, pending.ctx);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const price = prices?.[`${p.kind}:${quality}`];
  return (
    <Dialog open={p.open} onOpenChange={(o) => (!busy || o) && p.onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4" /> {p.title}</DialogTitle>
          {p.description && <DialogDescription>{p.description}</DialogDescription>}
        </DialogHeader>

        {phase.t === "preview" ? (
          p.preview!(phase.result as AiJobIO[K]["result"])
        ) : (
          <>
            {p.children}
            <fieldset disabled={busy} className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Quality</legend>
              {(["standard", "best"] as const).map((q) => (
                <label key={q} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <input type="radio" name={`quality-${p.feature}`} checked={quality === q} onChange={() => setQuality(q)} />
                  <span className="capitalize">{q}</span>
                  <span className="ml-auto text-muted-foreground">{formatPrice(prices?.[`${p.kind}:${q}`])}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> <Badge variant="secondary">{STATUS_LABEL[phase.status]}</Badge>
          </p>
        )}
        {phase.t === "error" && <AiErrorMessage err={phase.err} />}
        {p.blocked && phase.t !== "preview" && <p className="text-sm text-muted-foreground">{p.blocked}</p>}

        <DialogFooter>
          {phase.t === "preview" ? (
            <>
              <Button variant="outline" onClick={() => setPhase({ t: "idle" })}>Back</Button>
              <Button
                onClick={async () => {
                  try {
                    await p.onResult(phase.result as AiJobIO[K]["result"], phase.ctx);
                    setPhase({ t: "idle" });
                    p.onOpenChange(false);
                  } catch (e) {
                    setPhase({ t: "error", err: e instanceof Error ? e : new Error(String(e)) });
                  }
                }}
              >
                {p.applyLabel ?? "Apply"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => p.onOpenChange(false)}>Cancel</Button>
              <Button disabled={busy || !!p.blocked} onClick={generate}>
                {busy ? "Generating…" : "Generate"}
                {!busy && price && <span className="ml-1 text-xs opacity-80">{formatPrice(price)}</span>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
