"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";

// Gala Dock marketplace — Phase 4 server actions. Every write goes through requireWorkspace()
// (redirects unauthenticated/no-workspace users) and is additionally RLS-scoped server-side —
// see 20260717_marketplace_workflow.sql for the policies. Client components call these directly
// as form actions or via a thin client wrapper; none of them trust a client-supplied
// workspace_id for anything security-relevant (buyer_workspace_id here IS the caller's own
// active workspace, and supplier_workspace_id is populated by a DB trigger from the listing).

export async function toggleFavourite(listingId: string): Promise<{ favourited: boolean }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("marketplace_favourites")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    await supabase.from("marketplace_favourites").delete().eq("id", existing.id);
    revalidatePath("/event-manager/marketplace");
    return { favourited: false };
  }

  await supabase.from("marketplace_favourites").insert({ workspace_id: workspaceId, user_id: user.id, listing_id: listingId });
  revalidatePath("/event-manager/marketplace");
  return { favourited: true };
}

const MAX_COMPARE_ITEMS = 4;

export async function toggleCompareItem(listingId: string): Promise<{ compared: boolean; reason?: "limit_reached" }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("marketplace_comparison_items")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    await supabase.from("marketplace_comparison_items").delete().eq("id", existing.id);
    revalidatePath("/event-manager/marketplace");
    return { compared: false };
  }

  const { count } = await supabase
    .from("marketplace_comparison_items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if ((count ?? 0) >= MAX_COMPARE_ITEMS) {
    return { compared: false, reason: "limit_reached" };
  }

  await supabase.from("marketplace_comparison_items").insert({ workspace_id: workspaceId, user_id: user.id, listing_id: listingId });
  revalidatePath("/event-manager/marketplace");
  return { compared: true };
}

export async function recordRecentlyViewed(listingId: string): Promise<void> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await supabase
    .from("marketplace_recently_viewed")
    .upsert(
      { workspace_id: workspaceId, user_id: user.id, listing_id: listingId, viewed_at: new Date().toISOString() },
      { onConflict: "workspace_id,user_id,listing_id" }
    );
}

export async function createSavedSearch(name: string, query: Record<string, unknown>): Promise<void> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  await supabase.from("marketplace_saved_searches").insert({ workspace_id: workspaceId, user_id: user.id, name, query });
  revalidatePath("/event-manager/marketplace");
}

export interface SubmitEnquiryInput {
  listingId: string;
  eventDate?: string;
  eventType?: string;
  guestCount?: number;
  message: string;
}

/** Buyer -> venue enquiry. supplier_workspace_id is derived server-side by a DB trigger from listingId. */
export async function submitVenueEnquiry(input: SubmitEnquiryInput): Promise<{ id: string } | { error: string }> {
  const { workspaceId, user } = await requireWorkspace();
  if (!input.message.trim()) return { error: "Message is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_enquiries")
    .insert({
      listing_id: input.listingId,
      buyer_workspace_id: workspaceId,
      supplier_workspace_id: workspaceId, // overwritten by trigger; placeholder to satisfy NOT NULL before insert
      event_date: input.eventDate || null,
      event_type: input.eventType || null,
      guest_count: input.guestCount ?? null,
      message: input.message,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not send enquiry." };
  revalidatePath("/event-manager/marketplace");
  return { id: data.id };
}

export interface SubmitQuoteRequestInput {
  listingId: string;
  eventDate?: string;
  requirements?: string;
}

export async function submitQuoteRequest(input: SubmitQuoteRequestInput): Promise<{ id: string } | { error: string }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_quote_requests")
    .insert({
      listing_id: input.listingId,
      buyer_workspace_id: workspaceId,
      supplier_workspace_id: workspaceId, // overwritten by trigger
      event_date: input.eventDate || null,
      requirements: input.requirements || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not request a quote." };
  revalidatePath("/event-manager/marketplace");
  return { id: data.id };
}
