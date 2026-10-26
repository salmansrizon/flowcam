"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// Interface pieces ported from Excaliflow (Apache-2.0), index.html lines 420-500:
// .sidebar-section, .section-title, .segmented-row and .swatch-row, rebuilt on this repo's shadcn tokens.

/** Excaliflow's `.sidebar-section` with its `.section-title`. */
export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {title}
        {aside}
      </h3>
      {children}
    </section>
  );
}

/** Excaliflow's `.segmented-row`: a tray of equal buttons, one active. */
export function SegmentedRow<T extends string>(props: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <ToggleGroup
      type="single"
      aria-label={props.label}
      value={props.value}
      onValueChange={(v) => v && props.onChange(v as T)}
      spacing={0}
      className="grid w-full auto-cols-fr grid-flow-col gap-[3px] rounded-lg border bg-muted/60 p-[3px]"
    >
      {props.options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          size="sm"
          className="h-7 rounded-md text-xs font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-accent-foreground"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Excaliflow's `.swatch-row`: round-cornered colour chips, the active one ringed in the accent. `fill` is preview content. */
export function SwatchRow<T extends string>(props: { label: string; value: T; options: readonly { value: T; fill: string }[]; onChange: (v: T) => void }) {
  return (
    <ToggleGroup
      type="single"
      aria-label={props.label}
      value={props.value}
      onValueChange={(v) => v && props.onChange(v as T)}
      spacing={2}
      className="flex w-full flex-wrap justify-between"
    >
      {props.options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          aria-label={o.value}
          title={o.value}
          style={{ background: o.fill }}
          className={cn(
            "size-7 min-w-7 rounded-md border-[1.5px] border-foreground/15 p-0 transition-transform hover:scale-110 hover:bg-transparent",
            "data-[state=on]:ring-2 data-[state=on]:ring-primary data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-background",
          )}
        />
      ))}
    </ToggleGroup>
  );
}

/** A native range input (keyboard and screen-reader complete), tinted with the accent. */
export function RangeInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="range"
      className={cn("h-5 w-full cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
      {...props}
    />
  );
}

/** A native select dressed as the shadcn Select (the browser's picker keeps it keyboard-operable). */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
