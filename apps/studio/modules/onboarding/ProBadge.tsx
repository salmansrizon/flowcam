import { Badge } from "@/components/ui/badge";

export function ProBadge({ className }: { className?: string }) {
  return <Badge variant="secondary" className={className}>Pro</Badge>;
}
