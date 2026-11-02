"use client";

import { useState } from "react";
import { parsePresentation, type Narration, type Presentation } from "@flowcam/domain";
import { Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { writeAsset } from "../../presentation/assets";
import { base64ToBlob } from "../client";
import { AiJobDialog } from "./AiJobDialog";

/** A2.1: ask for a topic, run a presentation Job, hand the new Presentation to `onPick`. */
export function GenerateFromTopic({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (p: Presentation) => void | Promise<void> }) {
  const [topic, setTopic] = useState("");
  return (
    <AiJobDialog
      kind="presentation"
      feature="presentation"
      title="Generate from a topic"
      description="Describe what the Presentation is about. AI drafts the Boards and Steps."
      open={open}
      onOpenChange={onOpenChange}
      blocked={topic.trim() ? undefined : "Enter a topic first."}
      input={{ topic: topic.trim() }}
      onResult={async (r) => {
        // Validate the server's Presentation, and make it a new one.
        const p = parsePresentation(r.presentation);
        await onPick({ ...p, id: crypto.randomUUID() });
      }}
    >
      <Textarea aria-label="Topic" rows={3} placeholder="e.g. How a bill becomes law" value={topic} onChange={(e) => setTopic(e.target.value)} />
    </AiJobDialog>
  );
}

/** A2.2: "Write Scripts with AI" for the Board's Steps; previews the Scripts beside the current ones, then `onApply` (one edit). */
export function ScriptsAi({ labels, current, title, onApply }: { labels: string[]; current: string[]; title: string; onApply: (scripts: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" disabled={labels.length === 0} onClick={() => setOpen(true)}><Sparkles /> Write Scripts with AI</Button>
      <AiJobDialog
        kind="script"
        feature="script"
        title="Write Scripts with AI"
        description="One Script per Step of this Board."
        open={open}
        onOpenChange={setOpen}
        input={{ stepLabels: labels, context: title }}
        applyLabel="Apply Scripts"
        onResult={(r) => onApply(r.scripts)}
        preview={(r) => (
          <ol aria-label="Script preview" className="flex flex-col gap-2">
            {labels.map((l, i) => (
              <li key={i} className="rounded-lg border p-2 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Step {i + 1}: {l}</span>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <p><span className="block text-xs text-muted-foreground">Current</span>{current[i] || "(empty)"}</p>
                  <p data-testid="ai-script"><span className="block text-xs text-muted-foreground">AI</span>{r.scripts[i] ?? "(none)"}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      />
    </>
  );
}

/** A2.3: a prompt becomes an Image; `onImage` places it (the editor's own Insert-image path). */
export function GenerateImage({ open, onOpenChange, onImage }: { open: boolean; onOpenChange: (o: boolean) => void; onImage: (b: Blob) => void | Promise<void> }) {
  const [prompt, setPrompt] = useState("");
  return (
    <AiJobDialog
      kind="image"
      feature="image"
      title="Generate image"
      description="The image is added to the middle of the Board."
      open={open}
      onOpenChange={onOpenChange}
      blocked={prompt.trim() ? undefined : "Describe the image first."}
      input={{ prompt: prompt.trim(), width: 1024, height: 576 }}
      onResult={(r) => onImage(base64ToBlob(r.imageBase64, r.contentType))}
    >
      <Input aria-label="Image prompt" placeholder="Describe the image" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
    </AiJobDialog>
  );
}

/** A2.4: "Generate Voiceover" from the Step's Script; the audio is stored as an asset and set as the Narration. */
export function GenerateVoiceover({ script, stepId, onNarration }: { script: string; stepId: string; onNarration: (n: Narration) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Mic /> Generate Voiceover</Button>
      <AiJobDialog
        kind="voiceover"
        feature="voiceover"
        ctx={stepId}
        title="Generate Voiceover"
        description="An AI voice reads this Step's Script. Priced per minute of audio."
        open={open}
        onOpenChange={setOpen}
        blocked={script.trim() ? undefined : "Write a Script for this Step first. The Voiceover reads it."}
        input={{ text: script.trim() }}
        onResult={async (r) => {
          const assetId = await writeAsset(base64ToBlob(r.audioBase64, r.contentType));
          onNarration({ kind: "voice", assetId, durationMs: r.durationMs });
        }}
      />
    </>
  );
}
