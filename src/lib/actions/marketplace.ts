"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { randomUUID } from "node:crypto";
import type { ActionResult } from "./shell";
import { untyped } from "@/lib/workspace/db";

const Req = z.object({
  event_id: z.string().uuid(), category: z.string().trim().min(2).max(40), title: z.string().trim().min(3).max(160), scope: z.string().max(3000).default(""),
  budget_min: z.coerce.number().min(0).max(1e8).optional(), budget_max: z.coerce.number().min(0).max(1e8).optional(),
  requirements: z.record(z.string(), z.string().max(300)).default({}),
  response_hours: z.coerce.number().refine(v => [2, 4, 8, 12, 24, 48, 72].includes(v), "Choose an allowed response window"),
  hold: z.boolean().default(false), hold_hours: z.coerce.number().int().min(2).max(72).default(24), emergency: z.boolean().default(false), include_backups: z.boolean().default(true),
  recipients: z.array(z.object({ listing_id: z.string().uuid(), role: z.enum(["primary", "backup"]) })).min(1).max(12),
  attachments: z.array(z.object({ path:z.string().max(180),name:z.string().trim().min(1).max(120) })).max(6).default([]),
});
/** Send an RFQ: one canonical request + one build item per recipient (status "sent", server deadline), plus a thread and provider notification. */
export async function sendRequest(input: unknown): Promise<ActionResult> {
  const diagnostic=(stage:string)=>{if(process.env.GALA_PWA_DIAGNOSTICS==="1")console.info(`PWA request: ${stage}`);};diagnostic("start");
  const p = Req.safeParse(input); if (!p.success) return { ok: false, error: p.error.issues[0]?.message?.startsWith("Choose") ? p.error.issues[0].message : p.error.issues[0]?.path[0] === "recipients" ? "Select at least one provider." : "Complete the requirement (event, category, title)." };
  const ctx = await getOrganizer(); const d = p.data;diagnostic("authorized");
  for(const file of d.attachments){
    if(!new RegExp(`^${ctx.user.id}/[0-9a-f-]{36}\\.(png|jpg|webp|pdf)$`,"i").test(file.path))return {ok:false,error:"A request attachment is not owned by your account."};
    // The insert trigger joins proof to the exact storage object. Avoid a redundant
    // Storage SDK directory request; the own-row proof and atomic DB guard are authoritative.
    const proof=await untyped(ctx.supabase).from("verified_private_uploads").select("path").eq("path",file.path).eq("owner_id",ctx.user.id).not("object_id","is",null).maybeSingle();
    if(proof.error||!proof.data)return{ok:false,error:"A request attachment has not passed the upload checks. Upload it again."};
  }
  diagnostic("attachments checked");
  if (d.budget_min != null && d.budget_max != null && d.budget_min > d.budget_max) return { ok: false, error: "The minimum budget is higher than the maximum." };
  const { data: ev } = await ctx.supabase.from("events").select("id,name,starts_at,status").eq("id", d.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!ev) return { ok: false, error: "Event not found in this workspace." };
  if (["completed", "closed", "cancelled", "archived"].includes(ev.status)) return { ok: false, error: `Requests can't be sent for a ${ev.status} event.` };
  const ids = d.recipients.map(r => r.listing_id);
  const { data: listings } = await ctx.supabase.from("listings").select("id,name,image,category,kind,workspace_id,emergency_supply,price_from").in("id", ids).eq("published", true);
  if ((listings ?? []).length !== ids.length) return { ok: false, error: "One or more providers are no longer available on the marketplace." };
  if (d.emergency) {
    if (d.response_hours > 4) return { ok: false, error: "Emergency requests use a 2 or 4 hour response window." };
    const ineligible = (listings ?? []).filter(l => !l.emergency_supply).map(l => l.name);
    if (ineligible.length) return { ok: false, error: `Not eligible for emergency supply: ${ineligible.join(", ")}.` };
  }
  const { data: dup } = await ctx.supabase.from("build_items").select("listing_id,status").eq("event_id", ev.id).in("listing_id", ids).in("status", ["sent", "awaiting", "available", "quoted", "held", "confirmed"]);
  if (dup?.length) { const names = (listings ?? []).filter(l => dup.some(x => x.listing_id === l.id)).map(l => l.name); return { ok: false, error: `Already in progress for this event: ${names.join(", ")}.` }; }
  // RLS hides other workspaces' requests, so their references cannot be used to
  // allocate a globally unique sequential number. Allocate independent 128-bit IDs.
  const reference = `REQ-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-","")}`;
  const deadline = new Date(Date.now() + d.response_hours * 36e5).toISOString();
  const { data: req, error } = await ctx.supabase.from("provider_requests").insert({ reference, event_id: ev.id, created_by: ctx.user.id, category: d.category, title: d.title, scope: d.scope, requirements: { ...d.requirements, attachments:d.attachments, include_backups: String(d.include_backups) }, budget_min: d.budget_min ?? null, budget_max: d.budget_max ?? null, response_hours: d.response_hours, response_deadline: deadline, hold_strategy: d.hold ? "conditional" : "none", hold_hours: d.hold ? d.hold_hours : null, emergency: d.emergency, status: "sent" }).select("id").single();
  diagnostic(error?`database rejected (${error.code})`:"request created");
  if (error || !req) return { ok: false, error: "Could not create the request." };
  const L = new Map((listings ?? []).map(l => [l.id, l]));
  const { error: e2 } = await ctx.supabase.from("build_items").insert(d.recipients.map((r, i) => { const l = L.get(r.listing_id)!; return { event_id: ev.id, request_id: req.id, listing_id: l.id, category: d.category, title: l.name, package: d.title, scope: d.scope.slice(0, 500), image: l.image, status: "sent" as const, role: r.role, response_deadline: deadline, sort: 100 + i, price_basis: "quote" as const }; }));
  if (e2) { await ctx.supabase.from("provider_requests").update({ status: "cancelled" }).eq("id", req.id); return { ok: false, error: "Could not send to providers." }; }
  await ctx.supabase.from("threads").insert((listings ?? []).map(l => ({ event_id: ev.id, listing_id: l.id, kind: (l.kind === "venue" ? "venue" : "supplier") as "venue" | "supplier", title: l.name, subtitle: `${reference} · ${d.title}`.slice(0, 120), image: l.image, response_due_at: deadline })));
  // Notify each provider workspace owner (trusted server write after authorisation above).
  try {
    const admin = createAdminClient();
    const { data: owners } = await admin.from("workspaces").select("id,owner_id").in("id", [...new Set((listings ?? []).map(l => l.workspace_id))]);
    if (owners?.length) await admin.from("notifications").insert(owners.map(o => ({ user_id: o.owner_id, kind: d.emergency ? "emergency_request" : "request_received", title: `${d.emergency ? "Emergency request" : "New request"}: ${d.title}`.slice(0, 160), body: `${ev.name} · respond within ${d.response_hours}h`, link: "/provider" })));
  } catch { /* notification delivery is best-effort; the request itself is recorded */ }
  await writeAudit(ctx.user.id, ctx.workspace.id, "request.sent", { event_id: ev.id, request_id: req.id, recipients: ids.length, emergency: d.emergency, text: `Request ${reference} sent to ${ids.length} provider${ids.length === 1 ? "" : "s"}` });
  revalidatePath("/organizer/marketplace"); revalidatePath(`/organizer/events/${ev.id}`);
  return { ok: true, message: `${reference} sent to ${ids.length} provider${ids.length === 1 ? "" : "s"}. Responses due in ${d.response_hours}h.`, redirect: `/organizer/marketplace/requests/${req.id}` };
}

/** Choose a quote as primary (others on the request become backups) or as a backup. Non-binding; confirmation is separate. */
export async function selectQuote(itemId: string, role: "primary" | "backup"): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(itemId); if (!id.success) return { ok: false, error: "Invalid quote." };
  const ctx = await getOrganizer();
  const { data: it } = await ctx.supabase.from("build_items").select("id,request_id,event_id,status,title,events!inner(workspace_id)").eq("id", id.data).eq("events.workspace_id", ctx.workspace.id).maybeSingle();
  if (!it) return { ok: false, error: "Quote not found." };
  if (["declined", "unavailable", "cancelled", "expired"].includes(it.status)) return { ok: false, error: `${it.title} can't be selected (${it.status}).` };
  if (role === "primary" && !["quoted", "available", "held"].includes(it.status)) return { ok: false, error: `${it.title} hasn't quoted yet. Select it as a backup or wait for the response.` };
  if (role === "primary" && it.request_id) await ctx.supabase.from("build_items").update({ role: "backup" }).eq("request_id", it.request_id).neq("id", it.id).eq("role", "primary");
  const { error } = await ctx.supabase.from("build_items").update({ role, updated_at: new Date().toISOString() }).eq("id", it.id);
  if (error) return { ok: false, error: "Could not update." };
  revalidatePath(`/organizer/marketplace/requests/${it.request_id}`); revalidatePath(`/organizer/events/${it.event_id}`);
  return { ok: true, message: role === "primary" ? `${it.title} selected as primary. Confirm the booking when you're ready.` : `${it.title} kept as backup.` };
}

export async function messageAllProviders(requestId: string, body: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(requestId); if (!id.success || !body.trim()) return { ok: false, error: "Write a message." };
  const ctx = await getOrganizer();
  const { data: req } = await ctx.supabase.from("provider_requests").select("id,event_id,reference,events!inner(workspace_id)").eq("id", id.data).eq("events.workspace_id", ctx.workspace.id).maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  const { data: items } = await ctx.supabase.from("build_items").select("listing_id").eq("request_id", req.id).not("status", "in", "(declined,cancelled)");
  const { data: threads } = await ctx.supabase.from("threads").select("id,listing_id").eq("event_id", req.event_id).in("listing_id", (items ?? []).map(i => i.listing_id!).filter(Boolean));
  if (!threads?.length) return { ok: false, error: "No open provider conversations on this request." };
  const { error } = await ctx.supabase.from("messages").insert(threads.map(t => ({ thread_id: t.id, sender_id: ctx.user.id, sender_name: ctx.name, body: body.slice(0, 5000) })));
  if (error) return { ok: false, error: "Could not send." };
  await ctx.supabase.from("threads").update({ updated_at: new Date().toISOString() }).in("id", threads.map(t => t.id));
  return { ok: true, message: `Message sent to ${threads.length} provider${threads.length === 1 ? "" : "s"}.` };
}
