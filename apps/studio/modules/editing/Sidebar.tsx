"use client";

import { LAYOUTS, type Layout } from "@flowcam/domain";
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CAPTION_LOOKS } from "../captions/captions";
import { BACKGROUND_FILLS } from "../export/compose";
import { ASPECTS, BACKGROUNDS, CAPTION_POSITIONS, CAPTION_STYLES, MAX_CORNERS, MAX_PADDING, MAX_SHADOW, NO_COLOR_CORRECTION, setLayout, type Background, type Edits } from "./edits";
import { applyPreset, loadPresets, presetOf, storePresets } from "./presets";
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
  const [presets, setPresets] = useState(loadPresets);
  const [naming, setNaming] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  const savePresets = (next: typeof presets) => {
    setPresets(next);
    storePresets(next);
  };
  const gradient = edits.frame.gradient;
  const color = edits.color ?? NO_COLOR_CORRECTION;
  const setColor = (patch: Partial<typeof color>) => set({ color: { ...color, ...patch } });
  return (
  <aside className="w-80 shrink-0 overflow-y-auto border-l bg-sidebar p-4 text-sidebar-foreground">
    <div className="mb-3 grid gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">Style presets</h3>
      <div className="flex items-center gap-1.5">
        <NativeSelect
          aria-label="Presets"
          value={picked}
          className="min-w-0 flex-1"
          onChange={(e) => {
            const p = presets.find((x) => x.name === e.target.value);
            setPicked(e.target.value);
            if (p) apply(applyPreset(edits, p));
          }}
        >
          <option value="">{presets.length ? "Apply a preset…" : "No presets yet"}</option>
          {presets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Delete preset"
          disabled={!picked}
          onClick={() => {
            savePresets(presets.filter((p) => p.name !== picked));
            setPicked("");
          }}
        >
          <Trash2 />
        </Button>
      </div>
      {naming === null ? (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setNaming("")}>
          Save current look…
        </Button>
      ) : (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const name = naming.trim();
            if (!name) return;
            savePresets([...presets.filter((p) => p.name !== name), presetOf(name, edits)]);
            setPicked(name);
            setNaming(null);
          }}
        >
          <Input autoFocus aria-label="Preset name" placeholder="Preset name" value={naming} onChange={(e) => setNaming(e.target.value)} className="h-8" />
          <Button type="submit" size="sm" disabled={!naming.trim()}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNaming(null)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid h-8 w-full grid-cols-5">
        {["background", "camera", "audio", "captions", "layout"].map((t) => (
          <TabsTrigger key={t} value={t} className="px-1 text-xs capitalize">
            {t}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="background" className="grid gap-4 pt-2">
        <Section title="Aspect ratio">
          <SegmentedRow label="Aspect ratio" value={edits.aspect ?? "16:9"} options={ASPECTS.map((a) => ({ value: a, label: a }))} onChange={(aspect) => set({ aspect })} />
        </Section>
        <Section title="Background">
          <SwatchRow
            label="Background"
            value={gradient ? "custom" : edits.frame.background}
            options={[
              ...BACKGROUNDS.map((b) => ({ value: b as Background | "custom", fill: swatchFill(b) })),
              { value: "custom" as const, fill: gradient ? css(gradient) : "conic-gradient(#ff8a65, #a259ff, #22b8cf, #ff8a65)" },
            ]}
            onChange={(b) => {
              const rest = { ...edits.frame, gradient: undefined };
              set({ frame: b === "custom" ? { ...rest, gradient: { from: "#ff8a65", to: "#a259ff", angle: 135 } } : { ...rest, background: b } });
            }}
          />
          {gradient && (
            <div className="grid gap-2 rounded-lg border p-2">
              <div aria-label="Gradient preview" className="h-8 rounded-md border" style={{ background: css(gradient) }} />
              <div className="flex items-center gap-2 text-xs">
                <input type="color" aria-label="Gradient from" value={gradient.from} onChange={(e) => set({ frame: { ...edits.frame, gradient: { ...gradient, from: e.target.value } } })} className="h-7 w-10 cursor-pointer" />
                <input type="color" aria-label="Gradient to" value={gradient.to} onChange={(e) => set({ frame: { ...edits.frame, gradient: { ...gradient, to: e.target.value } } })} className="h-7 w-10 cursor-pointer" />
                <span className="ml-auto tabular-nums text-muted-foreground">{gradient.angle}°</span>
              </div>
              <RangeInput aria-label="Gradient angle" min={0} max={360} value={gradient.angle} onChange={(e) => set({ frame: { ...edits.frame, gradient: { ...gradient, angle: Number(e.target.value) } } })} />
            </div>
          )}
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
        <Section
          title="Colour correction"
          aside={
            <Button type="button" variant="ghost" size="xs" onClick={() => set({ color: NO_COLOR_CORRECTION })} disabled={!Object.values(color).some(Boolean)}>
              Reset
            </Button>
          }
        >
          {(["brightness", "contrast", "saturation", "temperature"] as const).map((k) => (
            <label key={k} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-xs capitalize">
              {k}
              <RangeInput aria-label={k} min={-100} max={100} value={color[k]} onChange={(e) => setColor({ [k]: Number(e.target.value) })} />
              <span className="text-right tabular-nums text-muted-foreground">{color[k]}</span>
            </label>
          ))}
        </Section>
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

const css = (g: { from: string; to: string; angle: number }) => `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`;

/** A background's swatch colour: a plain colour or the gradient it is drawn with. */
function swatchFill(b: Edits["frame"]["background"]) {
  const f = BACKGROUND_FILLS[b];
  return typeof f === "string" ? f : `linear-gradient(135deg, ${f[0]}, ${f[1]})`;
}

/** An icon button with a tooltip; its aria-label is the tooltip's text. */
