"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { FontPicker } from "@/components/studio/FontPicker";
import { Panel } from "@/components/studio/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, type TextOverlay } from "../edits";
import { Section, SwatchRow, RangeInput } from "../ui";

const SWATCHES = ["#ffffff", "#000000", "#fde047", "#f87171", "#60a5fa", "#4ade80"].map((c) => ({ value: c, fill: c }));
const HEX = /^#[0-9a-f]{6}$/i;

type Patch = Partial<Omit<TextOverlay, "id" | "clipId" | "start" | "end">>;

/** Properties of the selected text overlay. Every change goes through `onChange`, so it is undoable. */
export function TextPanel({ text, onChange, onDelete }: { text: TextOverlay; onChange: (patch: Patch) => void; onDelete: () => void }) {
  // Drafts hold input that is not valid to store yet (empty text, half-typed colour).
  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  return (
    <Panel role="group" aria-label="Text properties" className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
      <Section title="Text">
        <Textarea
          aria-label="Text"
          value={textDraft ?? text.text}
          onChange={(e) => {
            setTextDraft(e.target.value);
            if (e.target.value) onChange({ text: e.target.value });
          }}
          onBlur={() => setTextDraft(null)}
          className="min-h-16"
        />
      </Section>
      <Section title="Font">
        <FontPicker value={text.font} onChange={(font) => onChange({ font })} />
      </Section>
      <div className="grid content-start gap-3">
        <Section title="Size">
          <Input
            type="number"
            aria-label="Size"
            min={MIN_TEXT_SIZE}
            max={MAX_TEXT_SIZE}
            value={text.size}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(n)) onChange({ size: Math.round(Math.max(MIN_TEXT_SIZE, Math.min(MAX_TEXT_SIZE, n))) });
            }}
            className="h-8 w-24"
          />
        </Section>
        <Section title="Colour">
          <SwatchRow label="Colour" value={text.color.toLowerCase()} options={SWATCHES} onChange={(color) => (setHexDraft(null), onChange({ color }))} />
          <Input
            aria-label="Colour hex"
            value={hexDraft ?? text.color}
            onChange={(e) => {
              const v = e.target.value;
              setHexDraft(HEX.test(v) ? null : v);
              if (HEX.test(v)) onChange({ color: v });
            }}
            onBlur={() => setHexDraft(null)}
            className="h-8 w-28 font-mono"
          />
        </Section>
      </div>
      <Section title="Position">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          X
          <RangeInput aria-label="Position X" min={0} max={1} step={0.01} value={text.x} onChange={(e) => onChange({ x: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Y
          <RangeInput aria-label="Position Y" min={0} max={1} step={0.01} value={text.y} onChange={(e) => onChange({ y: Number(e.target.value) })} />
        </label>
      </Section>
      <Section title="Box">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" aria-label="Box" checked={text.box} onChange={(e) => onChange({ box: e.target.checked })} className="size-4 accent-primary" />
          Box behind text
        </label>
      </Section>
      <div className="flex items-end justify-end">
        <Button type="button" variant="outline" onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      </div>
    </Panel>
  );
}
