import "server-only";
import { notFound } from "next/navigation";
import type { CustomerCtx } from "./context";

export type MyEvent = { id: string; name: string; event_type: string; status: string; starts_at: string | null; ends_at: string | null; venue_name: string; location: string; city: string; guest_count: number; budget_total: number | null; cover_image: string; tags: string[]; settings: Record<string, unknown>; management: string; workspace_id: string | null; description: string; priorities: string[]; capacity: number | null; adults: number | null; children: number | null; currency: string; visibility: string; slug: string | null };
const COLS = "id,name,event_type,status,starts_at,ends_at,venue_name,location,city,guest_count,budget_total,cover_image,tags,settings,management,workspace_id,description,priorities,capacity,adults,children,currency,visibility,slug";
export type Summary = ReturnType<typeof summarise>;

/** Plain-language planning stage (1 Details · 2 Venue · 3 Providers · 4 Payments · 5 Ready) from canonical records. */
export function summarise(e: MyEvent, items: { status: string; role: string; amount: number | null; category: string; image: string; title: string }[], pays: { status: string; amount: number; due_at: string | null; payee: string; kind: string }[]) {
  const prim = items.filter(i => i.role === "primary" && !["cancelled", "declined", "suggested"].includes(i.status));
  const confirmed = prim.filter(i => ["confirmed", "fulfilled"].includes(i.status));
  const venueOk = items.some(i => i.category === "venue" && ["confirmed", "fulfilled"].includes(i.status)) || !!e.settings.venue_confirmed;
  const pkg = prim.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const paid = pays.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const due = Math.max(0, pkg - paid);
  const unpaid = pays.filter(p => ["due", "overdue", "scheduled"].includes(p.status)).sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const steps = [!!e.starts_at && !!e.name, venueOk, prim.length > 0 && confirmed.length === prim.length, prim.length > 0 && due === 0, e.status === "ready" || (venueOk && due === 0 && confirmed.length === prim.length && prim.length > 0)];
  const stage = steps.findIndex(s => !s) === -1 ? 5 : steps.findIndex(s => !s) + 1;
  const pending = prim.filter(i => ["quoted", "sent", "awaiting", "available", "held"].includes(i.status)).length;
  const next = !e.starts_at ? { label: "Add your event date", href: `/plan?step=2&event=${e.id}` }
    : !venueOk ? { label: "Choose a venue", href: `/account/events/${e.id}/build?cat=venue` }
    : pending ? { label: `Review ${pending} pending supplier quote${pending === 1 ? "" : "s"}`, href: `/account/events/${e.id}/build` }
    : unpaid.length ? { label: unpaid.length === 1 ? "Finalise remaining payment" : `Pay ${unpaid[0]!.payee} ${unpaid[0]!.kind}`, href: `/account/events/${e.id}/money` }
    : { label: "Review your day plan", href: `/account/events/${e.id}/plan?tab=day` };
  return { confirmed: confirmed.length, providers: prim.length, pkg, paid, due, stage, steps, next, venueOk, gallery: prim.map(i => i.image).filter(Boolean), unpaid };
}

export async function listMyEvents(ctx: CustomerCtx) {
  const { data } = await ctx.supabase.from("events").select(COLS).eq("owner_id", ctx.user.id).eq("management", "consumer").neq("status", "archived").order("starts_at", { ascending: true, nullsFirst: false });
  const events = (data ?? []) as unknown as MyEvent[]; const ids = events.map(e => e.id);
  const [{ data: items }, { data: pays }] = ids.length ? await Promise.all([
    ctx.supabase.from("build_items").select("event_id,status,role,amount,category,image,title").in("event_id", ids),
    ctx.supabase.from("payments").select("event_id,status,amount,due_at,payee,kind").in("event_id", ids),
  ]) : [{ data: [] }, { data: [] }];
  return events.map(e => ({ e, s: summarise(e, (items ?? []).filter(i => i.event_id === e.id), (pays ?? []).filter(p => p.event_id === e.id)) }));
}

/** Customer-owned event; 404 for anything else (RLS also enforces). Professional events redirect owners to read-only view. */
export async function getMyEvent(ctx: CustomerCtx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await ctx.supabase.from("events").select(COLS).eq("id", id).eq("owner_id", ctx.user.id).maybeSingle();
  if (!data) notFound();
  const e = data as unknown as MyEvent;
  const [{ data: items }, { data: pays }, { data: r }] = await Promise.all([
    ctx.supabase.from("build_items").select("*").eq("event_id", id).order("sort"),
    ctx.supabase.from("payments").select("*").eq("event_id", id).order("due_at"),
    ctx.supabase.rpc("event_readiness", { p_event: id }),
  ]);
  const s = summarise(e, items ?? [], pays ?? []);
  return { e, items: items ?? [], pays: pays ?? [], s, readiness: (r ?? { score: 0, checks: [] }) as { score: number; checks: { key: string; label: string; ok: boolean; severity: string }[] } };
}
export type MyEventFull = Awaited<ReturnType<typeof getMyEvent>>;
