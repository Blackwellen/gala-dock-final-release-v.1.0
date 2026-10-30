import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { dateShort, money } from "@/lib/format";

type Sb = SupabaseClient<Database>;
const clip = (s: string | null | undefined, n = 240) => (s ?? "").replace(/\s+/g, " ").slice(0, n);

/** Compact plain-text snapshot of records the caller can already see (RLS enforced by the user client). */
export async function buildContext(sb: Sb, userId: string, scope: "customer" | "organizer", eventId?: string): Promise<string | null> {
  const lines: string[] = [];
  if (eventId) {
    const { data: e } = await sb.from("events").select("id,name,event_type,status,starts_at,venue_name,location,guest_count,capacity,budget_total,currency,description,management").eq("id", eventId).maybeSingle();
    if (!e) return null;
    lines.push(`EVENT ${e.name} (${e.event_type}, status ${e.status}) on ${dateShort(e.starts_at)} at ${e.venue_name || "venue not set"}, ${e.location}. Guests ${e.guest_count}, capacity ${e.capacity ?? "n/a"}, budget ${e.budget_total ? money(e.budget_total) : "not set"}.`);
    if (e.description) lines.push(`Description: ${clip(e.description)}`);
    const [{ data: items }, { data: pays }, { data: tasks }, { data: tiers }, { data: readiness }] = await Promise.all([
      sb.from("build_items").select("category,title,package,amount,status,role,response_deadline,hold_expires_at").eq("event_id", eventId).order("sort"),
      sb.from("payments").select("payee,kind,amount,status,due_at").eq("event_id", eventId).order("due_at"),
      sb.from("tasks").select("title,status,priority,due_at").eq("event_id", eventId).neq("status", "done").order("due_at").limit(12),
      sb.from("ticket_tiers").select("name,price,quantity,sold,status").eq("event_id", eventId),
      sb.rpc("event_readiness", { p_event: eventId }),
    ]);
    for (const b of items ?? []) lines.push(`PROVIDER ${b.category}: ${b.title} — ${clip(b.package, 60)} — ${b.amount != null ? money(b.amount) : "price tbc"} — status ${b.status}${b.role !== "primary" ? ` (${b.role})` : ""}${b.response_deadline ? ` — reply due ${dateShort(b.response_deadline)}` : ""}${b.hold_expires_at ? ` — hold expires ${dateShort(b.hold_expires_at)}` : ""}`);
    for (const p of pays ?? []) lines.push(`PAYMENT ${p.payee} ${p.kind} ${money(p.amount)} ${p.status}${p.due_at ? ` due ${dateShort(p.due_at)}` : ""}`);
    for (const t of tasks ?? []) lines.push(`TASK ${t.title} (${t.priority}) ${t.due_at ? `due ${dateShort(t.due_at)}` : ""}`);
    for (const t of tiers ?? []) lines.push(`TICKETS ${t.name} ${money(t.price)} sold ${t.sold}/${t.quantity} ${t.status}`);
    const r = readiness as { score?: number; checks?: { label: string; ok: boolean }[] } | null;
    if (r?.checks) lines.push(`READINESS ${r.score}% — missing: ${r.checks.filter(c => !c.ok).map(c => c.label).join(", ") || "none"}`);
    return lines.join("\n");
  }
  if (scope === "customer") {
    const [{ data: events }, { data: tickets }] = await Promise.all([
      sb.from("events").select("id,name,event_type,status,starts_at,guest_count,budget_total").eq("owner_id", userId).order("starts_at"),
      sb.from("tickets").select("code,status,events(name,starts_at)").eq("holder_id", userId).limit(10),
    ]);
    for (const e of events ?? []) lines.push(`MY EVENT ${e.name} (${e.event_type}, ${e.status}) ${dateShort(e.starts_at)}, ${e.guest_count} guests, budget ${e.budget_total ? money(e.budget_total) : "n/a"}`);
    for (const t of tickets ?? []) { const ev = t.events as unknown as { name: string; starts_at: string } | null; lines.push(`MY TICKET ${ev?.name ?? ""} ${dateShort(ev?.starts_at)} ${t.status}`); }
    const { data: listings } = await sb.from("listings").select("name,kind,category,location,price_from,price_unit,capacity_max,rating").eq("published", true).order("rating", { ascending: false }).limit(25);
    for (const l of listings ?? []) lines.push(`MARKETPLACE ${l.kind} ${l.name} (${l.category}) ${l.location} from ${l.price_from != null ? money(l.price_from) : "n/a"} ${l.price_unit}${l.capacity_max ? `, up to ${l.capacity_max}` : ""}, rating ${l.rating}`);
    return lines.join("\n");
  }
  const { data: events } = await sb.from("events").select("id,name,status,starts_at,capacity,budget_total,settings").not("workspace_id", "is", null).order("starts_at").limit(20);
  for (const e of events ?? []) lines.push(`EVENT ${e.name} ${e.status} ${dateShort(e.starts_at)} capacity ${e.capacity ?? "n/a"} budget ${e.budget_total ? money(e.budget_total) : "n/a"}`);
  const [{ data: approvals }, { data: leads }] = await Promise.all([
    sb.from("agent_approvals").select("title,status,amount").eq("status", "pending").limit(10),
    sb.from("leads").select("name,stage,value,next_action").neq("stage", "lost").limit(15),
  ]);
  for (const a of approvals ?? []) lines.push(`APPROVAL PENDING ${a.title}${a.amount ? ` ${money(a.amount)}` : ""}`);
  for (const l of leads ?? []) lines.push(`LEAD ${l.name} ${l.stage} ${money(l.value)} next: ${clip(l.next_action, 60)}`);
  // Q17: server-detected schedule / resource / live-ops conflicts (operational_conflicts) for the caller's organizer workspaces.
  const { data: wsRows } = await sb.from("events").select("workspace_id").not("workspace_id", "is", null).limit(50);
  const rpc = sb.rpc as unknown as (f: string, a: object) => Promise<{ data: { severity: string; message: string; event_name: string | null }[] | null }>;
  for (const ws of [...new Set((wsRows ?? []).map(r => r.workspace_id as string))].slice(0, 3)) {
    const { data: conflicts } = await rpc.call(sb, "operational_conflicts", { p_ws: ws });
    for (const c of (conflicts ?? []).slice(0, 10)) lines.push(`CONFLICT ${c.severity} ${clip(c.message, 140)}${c.event_name ? ` (${c.event_name})` : ""}`);
  }
  return lines.join("\n");
}
