import { cn } from "@/lib/utils";
import type { ConversationBadge as BadgeKind } from "@/lib/messaging/types";

const STYLES: Record<BadgeKind, string> = {
  Client: "bg-emerald-50 text-emerald-700",
  Supplier: "bg-blue-50 text-blue-700",
  Internal: "bg-amber-50 text-amber-700",
};

export function ConversationBadge({ kind, className }: { kind: BadgeKind; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STYLES[kind], className)}>
      {kind}
    </span>
  );
}
