import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-orange-100 text-orange-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
];

function paletteIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % PALETTE.length;
}

/** Deterministic colour per conversation/participant so the same person or
 * conversation always renders the same avatar colour across the full Inbox,
 * thread view and Copilot panel. */
export function ConversationAvatar({
  initials,
  seed,
  size = "md",
  className,
}: {
  initials: string;
  seed: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "w-7 h-7 text-[11px]",
    md: "w-9 h-9 text-xs",
    lg: "w-11 h-11 text-sm",
  }[size];

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0",
        sizeClasses,
        PALETTE[paletteIndex(seed)],
        className,
      )}
    >
      {initials}
    </div>
  );
}
