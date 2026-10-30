import type { ProEvent, EventData } from "@/lib/data/event";
/** Props every event section receives (plan / operations / sell sub-sections registered in plan.tsx, ops.tsx, sell.tsx). */
export type SectionProps = { e: ProEvent; d: EventData; role: string };
