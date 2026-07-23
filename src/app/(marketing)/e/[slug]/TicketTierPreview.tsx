"use client";

// Thin client boundary: a Server Component cannot pass a function prop (onChange) straight to
// a "use client" component — the no-op handler has to originate on this side of the RSC boundary.
import { TicketTierList, type TicketTier } from "@/components/public-commerce/TicketTierList";

export function TicketTierPreview({ tiers }: { tiers: TicketTier[] }) {
  return <TicketTierList tiers={tiers} qty={{}} onChange={() => {}} dense />;
}
