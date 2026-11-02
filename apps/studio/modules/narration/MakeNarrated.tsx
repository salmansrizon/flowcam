"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Presentation } from "@flowcam/domain";
import { Button } from "@/components/ui/button";
import { savePresentation } from "../presentation/store";
import { buildNarratedRecording } from "./build";
import { DEFAULT_SILENCE_MS, fillSilence, missingNarrations, narratedSteps } from "./timing";

/**
 * "Make narrated video": lists Steps without a Narration (with a one-click fill) and refuses to build until every
 * Step has one. `onFill` should go through the editor's undo path.
 */
export function MakeNarrated({ presentation, onFill }: { presentation: Presentation; onFill: (fill: (p: Presentation) => Presentation) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = missingNarrations(presentation);
  const hasSteps = narratedSteps(presentation).length > 0;

  async function build() {
    setBusy(true);
    setError(null);
    try {
      await savePresentation(presentation); // Review reads the saved copy.
      router.push(`/review?recording=${await buildNarratedRecording(presentation)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t pt-3">
      <h4 className="text-xs font-medium text-muted-foreground">Narrated video</h4>
      {missing.length > 0 && (
        <div role="alert" aria-label="Steps without a Narration" className="flex flex-col gap-2 rounded-lg border border-input p-2 text-sm">
          <p>These Steps have no Narration yet:</p>
          <ul className="list-disc pl-5">{missing.map((m) => <li key={m.label}>{m.label}</li>)}</ul>
          <Button size="sm" variant="outline" onClick={() => onFill((p) => fillSilence(p, DEFAULT_SILENCE_MS))}>Use 3 s of silence for these</Button>
        </div>
      )}
      {!hasSteps && <p className="text-xs text-muted-foreground">Add Steps to the Board first.</p>}
      <Button size="sm" disabled={busy || !hasSteps || missing.length > 0} onClick={build}>{busy ? "Building…" : "Make narrated video"}</Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
