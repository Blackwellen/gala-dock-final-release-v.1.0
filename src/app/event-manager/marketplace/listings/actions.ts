"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export interface ListingFormInput {
  category: string;
  title: string;
  description: string;
  priceFromCents: number;
  priceUnit: string;
  coverageRegions: string[];
}

function parseForm(formData: FormData): ListingFormInput {
  const priceFromPounds = Number(formData.get("priceFrom") ?? 0);
  return {
    category: String(formData.get("category") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    priceFromCents: Math.max(0, Math.round(priceFromPounds * 100)),
    priceUnit: String(formData.get("priceUnit") ?? "fixed"),
    coverageRegions: String(formData.get("coverageRegions") ?? "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
  };
}

export async function createListing(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const input = parseForm(formData);

  if (!input.title || !input.category) {
    throw new Error("Title and category are required.");
  }

  const { data, error } = await supabase
    .from("marketplace_listings")
    .insert({
      workspace_id: workspaceId,
      category: input.category,
      title: input.title,
      description: input.description || null,
      price_from_cents: input.priceFromCents,
      price_unit: input.priceUnit,
      coverage_regions: input.coverageRegions,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/marketplace/listings");
  redirect(`/event-manager/marketplace/listings/${data.id}/edit`);
}

export async function updateListing(listingId: string, formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const input = parseForm(formData);

  const { error } = await supabase
    .from("marketplace_listings")
    .update({
      category: input.category,
      title: input.title,
      description: input.description || null,
      price_from_cents: input.priceFromCents,
      price_unit: input.priceUnit,
      coverage_regions: input.coverageRegions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/marketplace/listings");
  revalidatePath(`/event-manager/marketplace/listings/${listingId}/edit`);
}

export async function setListingStatus(listingId: string, status: "draft" | "live" | "paused") {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("marketplace_listings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/marketplace/listings");
  revalidatePath(`/event-manager/marketplace/listings/${listingId}/edit`);
}

export async function deleteListing(listingId: string) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { error } = await supabase
    .from("marketplace_listings")
    .delete()
    .eq("id", listingId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/event-manager/marketplace/listings");
  redirect("/event-manager/marketplace/listings");
}
