import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The bar across the top of every screen: brand on the left, the screen's own controls in the middle and actions
 * on the right. Styled after Excaliflow's header group (ADR 0001) on a calm neutral studio (ADR 0018).
 */
export function TopBar({ children, actions, className }: { children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur", className)}>
      <Link href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight">
        <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">F</span>
        Flowcam
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}
