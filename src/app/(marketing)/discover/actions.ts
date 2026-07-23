"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Toggle a favourite for the current authenticated buyer (public.customers row, not a
 * workspace member). Anonymous visitors get { ok: false } — the card reverts optimistic UI.
 */
export async function toggleFavourite(slug: string): Promise<{ ok: boolean; favourited?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to save favourites." };

  const { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
  if (!customer) return { ok: false, error: "No buyer account." };

  const { data: page } = await supabase
    .from("event_public_pages")
    .select("event_id")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) return { ok: false, error: "Event not found." };

  const { data: existing } = await supabase
    .from("event_favourites")
    .select("id")
    .eq("event_id", page.event_id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("event_favourites").delete().eq("id", existing.id);
    return { ok: true, favourited: false };
  }

  await supabase.from("event_favourites").insert({ event_id: page.event_id, customer_id: customer.id });
  return { ok: true, favourited: true };
}
