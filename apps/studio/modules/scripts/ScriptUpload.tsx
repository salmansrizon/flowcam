"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, GripHorizontal, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { assignPassages, moveDivider } from "./assign";
import { splitScript } from "./split";

const DRAG_STEP = 28; // px of vertical drag per sentence moved

/** "Upload Script" button and dialog: previews a document's passages against the Board's Steps, then hands the texts to `onApply` (one edit). */
export function ScriptUpload({ labels, onApply }: { labels: string[]; onApply: (texts: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [texts, setTexts] = useState<string[]>([]);
  const [joined, setJoined] = useState(false);
  const [unfilled, setUnfilled] = useState(0);
  const drag = useRef<{ i: number; y: number } | null>(null);

  function load(text: string) {
    setRaw(text);
    const a = assignPassages(splitScript(text), labels.length);
    setTexts(a.texts);
    setJoined(a.joined);
    setUnfilled(a.unfilled);
  }
  const move = (i: number, dir: "up" | "down") => setTexts((t) => moveDivider(t, i, dir));

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Upload /> Upload Script</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Script</DialogTitle>
            <DialogDescription>Paragraphs become Scripts, one per Step. A line of --- forces a break.</DialogDescription>
          </DialogHeader>
          <input
            type="file"
            aria-label="Script file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); e.target.value = ""; }}
          />
          <Textarea aria-label="Pasted Script" rows={4} placeholder="…or paste the Script here" value={raw} onChange={(e) => load(e.target.value)} />
          {joined && (
            <p role="alert" className="flex items-center gap-2 text-sm text-amber-600"><AlertTriangle className="size-4" /> More passages than Steps: the extras were joined into the last Step.</p>
          )}
          {unfilled > 0 && texts.length > 0 && (
            <p role="alert" className="flex items-center gap-2 text-sm text-amber-600"><AlertTriangle className="size-4" /> Fewer passages than Steps: the last {unfilled} Step{unfilled > 1 ? "s keep" : " keeps"} their existing Scripts.</p>
          )}
          <ol aria-label="Preview" className="flex flex-col">
            {texts.map((t, i) => (
              <li key={i}>
                <div className="rounded-lg border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Step {i + 1}: {labels[i]}</span>
                    <span className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Move to previous Step (Step ${i + 1})`} disabled={i === 0} onClick={() => move(i - 1, "down")}><ArrowUp /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Move to next Step (Step ${i + 1})`} disabled={i === texts.length - 1} onClick={() => move(i, "up")}><ArrowDown /></Button>
                    </span>
                  </div>
                  <p data-testid="passage">{t}</p>
                </div>
                {i < texts.length - 1 && (
                  <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label={`Divider between Step ${i + 1} and Step ${i + 2}`}
                    className="flex h-5 cursor-row-resize touch-none items-center justify-center text-muted-foreground"
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { i, y: e.clientY }; }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (!d) return;
                      const dy = e.clientY - d.y;
                      if (Math.abs(dy) >= DRAG_STEP) { move(d.i, dy < 0 ? "up" : "down"); d.y = e.clientY; }
                    }}
                    onPointerUp={() => { drag.current = null; }}
                    onPointerCancel={() => { drag.current = null; }}
                  >
                    <GripHorizontal className="size-4" />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!texts.length} onClick={() => { onApply(texts); setOpen(false); }}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
