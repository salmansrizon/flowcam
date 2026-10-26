import { cn } from "@/lib/utils";

/** A floating panel, as Excaliflow's glass panel: translucent surface, hairline border, soft shadow. */
export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl border bg-background/95 shadow-[var(--panel-shadow)] backdrop-blur", className)}
      {...props}
    />
  );
}
