"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/domain/permissions";
import { writeAudit } from "@/lib/audit";
import type { ActionResult } from "./shell";

// Q57: the request page's "Edit request" and "Invite providers" used to open the new-request wizard, which created a second RFQ.
// These edit the existing request in place: same reference, same thread per provider, providers told what changed.
const OPEN = ["sent", "awaiting", "clarification", "quote_received", "declined", "expired_no_response", "closed"];
const LIVE_ITEM = ["sent", "awaiting", "available", "quoted", "held", "confirmed", "conditional_hold_requested", "standby"];

async function own(requestId: string) {
  if (!z.string().uuid().safeParse(requestId).success) return null;
  const ctx = await getOrganizer();
  if (!can("organizer", ctx.role, "marketplace.request")) return { ctx, r: null, denied: true as const };
  const { data: r } = await ctx.supabase.from("provider_requests").select("id,reference,title,scope,category,status,budget_min,budget_max,response_hours,response_deadline,emergency,event_id,events!inner(id,name,status,workspace_id)")
    .eq("id", requestId).eq("events.workspace_id", ctx.workspace.id).maybeSingle();
  return { ctx, r, denied: false as const };
}

const Edit = z.object({
  title: z.string().trim().min(3).max(160), scope: z.string().max(3000).default(""),
  budget_min: z.coerce.number().min(0).max(1e8).nullable().optional(), budget_max: z.coerce.number().min(0).max(1e8).nullable().optional(),
  response_deadline: z.string().datetime({ offset: true }).nullable().optional(),
});

/** Edit an open request's brief (title, scope, budget, response deadline). Providers still quoting get a message in their thread. */
export async function updateRequest(requestId: string, input: unknown): Promise<ActionResult> {
  const o = await own(requestId); if (!o) return { ok: false, error: "Request not found." };
  if (o.denied) return { ok: false, error: "You don’t have permission to change requests." };
  const { ctx, r } = o; if (!r) return { ok: false, error: "Request not found." };
  if (!OPEN.includes(r.status as string)) return { ok: false, error: `A ${r.status} request can’t be edited.` };
  const p = Edit.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "title" ? "Give the request a title (3–160 characters)." : "Check the budget and deadline." };
  const d = p.data;
  if (d.budget_min != null && d.budget_max != null && d.budget_min > d.budget_max) return { ok: false, error: "The minimum budget is higher than the maximum." };
  if (d.response_deadline && Date.parse(d.response_deadline) <= Date.now()) return { ok: false, error: "The response deadline must be in the future." };
  const patch = { title: d.title, scope: d.scope, budget_min: d.budget_min ?? null, budget_max: d.budget_max ?? null, ...(d.response_deadline ? { response_deadline: d.response_deadline } : {}) };
  const { error } = await ctx.supabase.from("provider_requests").update(patch).eq("id", r.id);
  if (error) return { ok: false, error: "Couldn’t save the request." };
  if (d.response_deadline) await ctx.supabase.from("build_items").update({ response_deadline: d.response_deadline }).eq("request_id", r.id).in("status", ["sent", "awaiting"]);
  const changed = [r.title !== d.title && "title", (r.scope ?? "") !== d.scope && "scope", (Number(r.budget_min ?? -1) !== Number(d.budget_min ?? -1) || Number(r.budget_max ?? -1) !== Number(d.budget_max ?? -1)) && "budget", d.response_deadline && d.response_deadline !== r.response_deadline && "response deadline"].filter(Boolean) as string[];
  if (changed.length) {
    const { data: items } = await ctx.supabase.from("build_items").select("listing_id").eq("request_id", r.id).in("status", LIVE_ITEM);
    const ids = (items ?? []).map(i => i.listing_id).filter(Boolean) as string[];
    const { data: threads } = ids.length ? await ctx.supabase.from("threads").select("id").eq("event_id", r.event_id).in("listing_id", ids) : { data: [] };
    if (threads?.length) await ctx.supabase.from("messages").insert(threads.map(t => ({ thread_id: t.id, sender_id: ctx.user.id, sender_name: ctx.name, body: `Request ${r.reference} updated (${changed.join(", ")}). Please check the brief before quoting.` })));
  }
  await writeAudit(ctx.user.id, ctx.workspace.id, "request.updated", { request_id: r.id, changed, text: `Request ${r.reference} updated` });
  revalidatePath(`/organizer/marketplace/requests/${r.id}`);
  return { ok: true, message: changed.length ? "Request updated. Providers still quoting have been told." : "No changes to save." };
}

/** Invite more providers to the same request: one build item + thread per provider, same deadline, provider notified. */
export async function inviteToRequest(requestId: string, listingIds: string[]): Promise<ActionResult> {
  const o = await own(requestId); if (!o) return { ok: false, error: "Request not found." };
  if (o.denied) return { ok: false, error: "You don’t have permission to change requests." };
  const { ctx, r } = o; if (!r) return { ok: false, error: "Request not found." };
  if (!["sent", "awaiting", "clarification", "quote_received", "declined", "expired_no_response"].includes(r.status as string)) return { ok: false, error: "Reopen the request before inviting more providers." };
  const ev = r.events as unknown as { id: string; name: string; status: string };
  if (["completed", "closed", "cancelled", "archived"].includes(ev.status)) return { ok: false, error: `Requests can't be sent for a ${ev.status} event.` };
  const ids = [...new Set(listingIds)].filter(id => z.string().uuid().safeParse(id).success);
  if (!ids.length || ids.length > 12) return { ok: false, error: "Choose between 1 and 12 providers." };
  const { data: existing } = await ctx.supabase.from("build_items").select("id,listing_id,sort").eq("request_id", r.id);
  if ((existing ?? []).length + ids.length > 20) return { ok: false, error: "A request can go to at most 20 providers." };
  const { data: listings } = await ctx.supabase.from("listings").select("id,name,image,category,kind,workspace_id,emergency_supply").in("id", ids).eq("published", true).is("paused_at", null);
  if ((listings ?? []).length !== ids.length) return { ok: false, error: "One or more providers are no longer available on the marketplace." };
  if (r.emergency) { const bad = (listings ?? []).filter(l => !l.emergency_supply).map(l => l.name); if (bad.length) return { ok: false, error: `Not eligible for emergency supply: ${bad.join(", ")}.` }; }
  const { data: dup } = await ctx.supabase.from("build_items").select("listing_id").eq("event_id", r.event_id).in("listing_id", ids).in("status", LIVE_ITEM);
  if (dup?.length) { const names = (listings ?? []).filter(l => dup.some(x => x.listing_id === l.id)).map(l => l.name); return { ok: false, error: `Already in progress for this event: ${names.join(", ")}.` }; }
  const deadline = r.response_deadline && Date.parse(r.response_deadline) > Date.now() ? r.response_deadline : new Date(Date.now() + Number(r.response_hours ?? 24) * 36e5).toISOString();
  const base = Math.max(100, ...(existing ?? []).map(i => Number(i.sort ?? 0))) + 1;
  const { error } = await ctx.supabase.from("build_items").insert((listings ?? []).map((l, i) => ({ event_id: r.event_id, request_id: r.id, listing_id: l.id, category: r.category, title: l.name, package: r.title, scope: String(r.scope ?? "").slice(0, 500), image: l.image, status: "sent" as const, role: "backup" as const, response_deadline: deadline, sort: base + i, price_basis: "quote" as const })));
  if (error) return { ok: false, error: "Couldn’t invite those providers." };
  const { data: threads } = await ctx.supabase.from("threads").select("listing_id").eq("event_id", r.event_id).in("listing_id", ids);
  const have = new Set((threads ?? []).map(t => t.listing_id));
  const fresh = (listings ?? []).filter(l => !have.has(l.id));
  if (fresh.length) await ctx.supabase.from("threads").insert(fresh.map(l => ({ event_id: r.event_id, listing_id: l.id, kind: (l.kind === "venue" ? "venue" : "supplier") as "venue" | "supplier", title: l.name, subtitle: `${r.reference} · ${r.title}`.slice(0, 120), image: l.image, response_due_at: deadline })));
  try {
    const admin = createAdminClient();
    const { data: owners } = await admin.from("workspaces").select("id,owner_id").in("id", [...new Set((listings ?? []).map(l => l.workspace_id))]);
    if (owners?.length) await admin.from("notifications").insert(owners.map(w => ({ user_id: w.owner_id, kind: r.emergency ? "emergency_request" : "request_received", title: `${r.emergency ? "Emergency request" : "New request"}: ${r.title}`.slice(0, 160), body: `${ev.name} · respond by ${new Date(deadline).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, link: "/provider" })));
  } catch { /* best-effort, as for sendRequest */ }
  await writeAudit(ctx.user.id, ctx.workspace.id, "request.invited", { request_id: r.id, recipients: ids.length, text: `${ids.length} provider${ids.length === 1 ? "" : "s"} invited to ${r.reference}` });
  revalidatePath(`/organizer/marketplace/requests/${r.id}`); revalidatePath(`/organizer/events/${r.event_id}`);
  return { ok: true, message: `Invited ${ids.length} provider${ids.length === 1 ? "" : "s"} to ${r.reference}.` };
}
