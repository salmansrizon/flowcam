"use client";

import { LAYOUTS, type Layout } from "@flowcam/domain";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CAPTION_LOOKS } from "../captions/captions";
import { BACKGROUND_FILLS } from "../export/compose";
import { BACKGROUNDS, CAPTION_POSITIONS, CAPTION_STYLES, MAX_CORNERS, MAX_PADDING, MAX_SHADOW, setLayout, type Edits } from "./edits";
import { NativeSelect, RangeInput, SegmentedRow, Section, SwatchRow } from "./ui";

/** The Review screen's settings sidebar (Cap-style tabs): Background, Camera, Audio, Captions and Layout. */
export function Sidebar({
  edits,
  set,
  apply,
  tab,
  setTab,
  here,
  captionFiles,
  playhead,
  layoutChoice,
  setLayoutChoice,
}: {
  edits: Edits;
  set: (patch: Partial<Edits>) => void;
  apply: (next: Edits) => void;
  tab: string;
  setTab: (tab: string) => void;
  /** The Layout at the playhead, for display. */
  here: string;
  captionFiles: { srt: string; vtt: string } | null;
  playhead: number;
  layoutChoice: Layout | "auto";
  setLayoutChoice: (l: Layout | "auto") => void;
}) {
  return (
  <aside className="w-80 shrink-0 overflow-y-auto border-l bg-sidebar p-4 text-sidebar-foreground">
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid h-8 w-full grid-cols-5">
        {["background", "camera", "audio", "captions", "layout"].map((t) => (
          <TabsTrigger key={t} value={t} className="px-1 text-xs capitalize">
            {t}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="background" className="grid gap-4 pt-2">
        <Section title="Background">
          <SwatchRow
            label="Background"
            value={edits.frame.background}
            options={BACKGROUNDS.map((b) => ({ value: b, fill: swatchFill(b) }))}
            onChange={(b) => set({ frame: { ...edits.frame, background: b } })}
          />
        </Section>
        <Section title="Padding">
          <RangeInput aria-label="Padding" min={0} max={MAX_PADDING} value={edits.frame.padding} onChange={(e) => set({ frame: { ...edits.frame, padding: Number(e.target.value) } })} />
        </Section>
        <Section title="Shadow">
          <RangeInput aria-label="Shadow" min={0} max={MAX_SHADOW} value={edits.frame.shadow} onChange={(e) => set({ frame: { ...edits.frame, shadow: Number(e.target.value) } })} />
        </Section>
        <Section title="Corners">
          <RangeInput aria-label="Corners" min={0} max={MAX_CORNERS} value={edits.frame.corners ?? 20} onChange={(e) => set({ frame: { ...edits.frame, corners: Number(e.target.value) } })} />
        </Section>
      </TabsContent>

      <TabsContent value="camera" className="grid gap-4 pt-2">
        <Section title="Layout">
          <p className="text-sm">
            At the playhead: <strong>{here}</strong>
          </p>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setTab("layout")}>
            Change the Layout
          </Button>
        </Section>
      </TabsContent>

      <TabsContent value="audio" className="grid gap-4 pt-2">
        <Section title="Clean up">
          <div className="flex items-center gap-2">
            <Switch id="enhance-audio" checked={edits.enhanceAudio} onCheckedChange={(v) => set({ enhanceAudio: v })} />
            <Label htmlFor="enhance-audio">Noise reduction and levelling</Label>
          </div>
          <p className="text-xs text-muted-foreground">{edits.enhanceAudio ? "On: applied when you export." : "Off: the Microphone is exported as recorded."}</p>
        </Section>
      </TabsContent>

      <TabsContent value="captions" className="grid gap-4 pt-2">
        <Section title="Style">
          <SegmentedRow
            label="Caption style"
            value={edits.captions.style}
            options={CAPTION_STYLES.map((s) => ({ value: s, label: CAPTION_LOOKS[s].name }))}
            onChange={(style) => set({ captions: { ...edits.captions, style } })}
          />
        </Section>
        <Section title="Position">
          <SegmentedRow
            label="Caption position"
            value={edits.captions.position}
            options={CAPTION_POSITIONS.map((p) => ({ value: p, label: p }))}
            onChange={(position) => set({ captions: { ...edits.captions, position } })}
          />
        </Section>
        <Section title="Caption files">
          {captionFiles ? (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={captionFiles.srt} download="flowcam.srt">
                  <Download /> Download SRT
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={captionFiles.vtt} download="flowcam.vtt">
                  <Download /> Download VTT
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No Transcript yet.</p>
          )}
        </Section>
      </TabsContent>

      <TabsContent value="layout" className="grid gap-4 pt-2">
        <Section title="Layout from the playhead on">
          <div className="flex items-center gap-2">
            <NativeSelect aria-label="Layout" value={layoutChoice} onChange={(e) => setLayoutChoice(e.target.value as Layout | "auto")} className="flex-1">
              <option value="auto">Follow the Steps</option>
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <Button type="button" onClick={() => apply(setLayout(edits, playhead, layoutChoice))}>
              Set Layout
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {edits.layouts.length} Layout {edits.layouts.length === 1 ? "change" : "changes"} on the Timeline.
          </p>
        </Section>
      </TabsContent>
    </Tabs>
  </aside>
  );
}

/** A background's swatch colour: a plain colour or the gradient it is drawn with. */
function swatchFill(b: Edits["frame"]["background"]) {
  const f = BACKGROUND_FILLS[b];
  return typeof f === "string" ? f : `linear-gradient(135deg, ${f[0]}, ${f[1]})`;
}

/** An icon button with a tooltip; its aria-label is the tooltip's text. */
