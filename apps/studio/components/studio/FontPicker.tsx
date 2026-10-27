"use client";

import { FONT_IDS, FONT_LABELS, FONT_STACKS, type FontId } from "@flowcam/domain";
import { cn } from "@/lib/utils";

/** Picks one of the shared font families, each shown in its own face. Used by the Style panel and text overlays. */
export function FontPicker({ value, onChange, label = "Font", className }: { value: FontId; onChange: (font: FontId) => void; label?: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid grid-cols-2 gap-1", className)}>
      {FONT_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          style={{ fontFamily: FONT_STACKS[id] }}
          className={cn(
            "rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === id ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted",
          )}
        >
          {FONT_LABELS[id]}
        </button>
      ))}
    </div>
  );
}
