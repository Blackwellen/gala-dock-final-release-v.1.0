"use client";

import { PlanBuilder, type Tier } from "@/components/venue-plan/plan-builder";
import type { MapEl, MapSpace } from "@/app/provider/venues/_components/venue-map";
import { saveEventPlan } from "./actions";

export function EventPlanEditor({ eventId, base, overlay, spaces, tiers, version, draftVersion = 0, geo }: { eventId: string; base: MapEl[]; overlay: MapEl[]; spaces: MapSpace[]; tiers: Tier[]; version: number; draftVersion?: number; geo: { lat: number; lng: number } | null }) {
  return <PlanBuilder mode="event" base={base} initial={overlay} spaces={spaces} tiers={tiers} version={version} draftVersion={draftVersion} geo={geo} height={640} onSave={(els, publish) => saveEventPlan(eventId, els, publish)} />;
}
