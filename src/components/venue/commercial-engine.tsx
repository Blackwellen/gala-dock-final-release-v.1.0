import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { RateCards, type RateCard } from "./rate-cards";

/** Drop-in for the venue Commercial tab: rate cards + live quote/conflict check (§60). RLS scopes every read and write. */
export async function VenueCommercialEngine({ venueId, workspaceId, canManage }: { venueId: string; workspaceId: string; canManage: boolean }) {
  const db = untyped((await createClient()) as never);
  const [{ data: spaces }, { data: cards }] = await Promise.all([
    db.from("spaces").select("id,name").eq("venue_id", venueId).order("name"),
    db.from("venue_rate_cards").select("*").eq("venue_id", venueId).order("priority").order("name"),
  ]);
  return <RateCards workspaceId={workspaceId} venueId={venueId} spaces={spaces ?? []} cards={(cards ?? []) as RateCard[]} canManage={canManage} />;
}
