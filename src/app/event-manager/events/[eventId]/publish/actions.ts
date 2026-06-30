"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export interface PublishInput {
  published: boolean;
  headline: string;
  summary: string;
  startsAt: string; // YYYY-MM-DD
  city: string;
  ticketsEnabled: boolean;
}

// EB-L: make an event public/private + publicise. Upserts event_public_pages (published rows are
// anon-readable and appear on /discover and /e/[slug]).
export async function saveEventPublicPage(eventId: string, form: PublishInput): Promise<{ ok: boolean; slug: string }> {
  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();

  const { data: ev } = await supabase.from("events").select("id, name, event_type").eq("workspace_id", workspaceId).eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false, slug: "" };

  const { data: existing } = await supabase
    .from("event_public_pages")
    .select("id, slug")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .maybeSingle();

  const slug = existing?.slug ?? `${slugify(ev.name) || "event"}-${eventId.slice(0, 6)}`;
  const startsAt = /^\d{4}-\d{2}-\d{2}$/.test(form.startsAt) ? new Date(form.startsAt).toISOString() : null;

  const payload = {
    workspace_id: workspaceId,
    event_id: eventId,
    slug,
    published: form.published,
    headline: form.headline.trim() || ev.name,
    summary: form.summary.trim() || null,
    starts_at: startsAt,
    city: form.city.trim() || null,
    category: ev.event_type ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("event_public_pages").update(payload).eq("id", existing.id)
    : await supabase.from("event_public_pages").insert({ ...payload, created_by: user.id });
  if (error) return { ok: false, slug };

  // Publicising ticket sales = open the event's ticket types for sale.
  if (form.published && form.ticketsEnabled) {
    await supabase
      .from("ticket_types")
      .update({ status: "on_sale" })
      .eq("workspace_id", workspaceId)
      .eq("event_id", eventId)
      .eq("status", "draft");
  }

  revalidatePath(`/event-manager/events/${eventId}/publish`);
  revalidatePath("/discover");
  return { ok: true, slug };
}
