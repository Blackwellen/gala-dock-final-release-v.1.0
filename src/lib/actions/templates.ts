"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";

const MODS = ["plan", "schedule", "providers", "tickets", "promotion", "staffing", "risk"] as const;
const Save = z.object({ event_id: z.string().uuid(), name: z.string().trim().min(3).max(80), description: z.string().max(500), event_types: z.array(z.string().trim().min(1).max(30)).min(1).max(10), modules: z.record(z.enum(MODS), z.boolean()) });

/** Snapshot an event's reusable structure into a template. Guests, money, messages and dates are never copied. */
export async function saveTemplate(input: unknown): Promise<ActionResult> {
  const p = Save.safeParse(input); if (!p.success) return { ok: false, error: String(p.error.issues[0]?.path[0]) === "event_types" ? "Choose at least one event type." : "Give the template a name (3+ characters)." };
  const ctx = await getOrganizer(); const sb = ctx.supabase; const m = p.data.modules;
  const { data: e } = await sb.from("events").select("id,event_type,description,goal,capacity,starts_at,ends_at,settings").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const start = e.starts_at ? Date.parse(e.starts_at) : null;
  const rel = (iso: string) => start ? Math.round((Date.parse(iso) - start) / 6e4) : 0; // minutes from event start — no absolute dates
  const [{ data: prog }, { data: tiers }, { data: items }, { data: shifts }, { data: tasks }, { data: promos }] = await Promise.all([
    m.schedule ? sb.from("programme_items").select("title,area,kind,starts_at,duration_minutes").eq("event_id", e.id) : Promise.resolve({ data: [] }),
    m.tickets ? sb.from("ticket_tiers").select("name,description,kind,price,quantity,badge,color,sort").eq("event_id", e.id).order("sort") : Promise.resolve({ data: [] }),
    m.providers ? sb.from("build_items").select("category,package,scope").eq("event_id", e.id) : Promise.resolve({ data: [] }),
    m.staffing ? sb.from("shifts").select("role,headcount").eq("event_id", e.id) : Promise.resolve({ data: [] }),
    m.risk || m.plan ? sb.from("tasks").select("title,category,priority,due_at").eq("event_id", e.id) : Promise.resolve({ data: [] }),
    m.promotion ? sb.from("promotions").select("channel,audience,title").eq("event_id", e.id) : Promise.resolve({ data: [] }),
  ]);
  const roles = Object.entries((shifts ?? []).reduce<Record<string, number>>((a, x) => ({ ...a, [x.role || "Crew"]: (a[x.role || "Crew"] ?? 0) + (x.headcount || 1) }), {})).map(([role, count]) => ({ role, count }));
  const content = {
    ...(m.plan ? { overview: { event_type: e.event_type, description: e.description, goal: e.goal, capacity: e.capacity, duration_hours: e.starts_at && e.ends_at ? Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 36e5) : null } } : {}),
    ...(m.schedule ? { schedule: (prog ?? []).map(x => ({ title: x.title, area: x.area, kind: x.kind, offset_min: rel(x.starts_at), duration_minutes: x.duration_minutes })) } : {}),
    ...(m.tickets ? { tiers: (tiers ?? []).map(t => ({ name: t.name, description: t.description, kind: t.kind, price: Number(t.price), quantity: t.quantity, badge: t.badge, color: t.color })) } : {}),
    ...(m.providers ? { providers: [...new Map((items ?? []).map(i => [i.category, { category: i.category, scope: i.scope || i.package }])).values()] } : {}),
    ...(m.staffing ? { roles } : {}),
    ...(m.promotion ? { promotion: [...new Map((promos ?? []).map(x => [x.channel, { channel: x.channel, audience: x.audience }])).values()] } : {}),
    ...(m.risk || m.plan ? { tasks: (tasks ?? []).filter(t => m.risk || !["risk"].includes(t.category)).map(t => ({ title: t.title, category: t.category, priority: t.priority, days_before: start && t.due_at ? Math.round((start - Date.parse(t.due_at)) / 864e5) : null })) } : {}),
  };
  const { error } = await sb.from("event_templates").insert({ workspace_id: ctx.workspace.id, source_event_id: e.id, name: p.data.name, description: p.data.description, event_types: p.data.event_types, modules: { ...m, content } as unknown as Json });
  if (error) return { ok: false, error: "Could not save the template." };
  await sb.from("audit_events").insert({ actor_id: ctx.user.id, workspace_id: ctx.workspace.id, event: "template.saved", metadata: { event_id: e.id, name: p.data.name } });
  revalidatePath("/organizer/events"); return { ok: true, message: `Template "${p.data.name}" saved.`, redirect: "/organizer/events?tab=templates" };
}
