"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOptionalPersonaContext } from "@/lib/flags/context";
import { SLASH_BY_ID } from "@/lib/copilot/commands";
import { chatComplete, estimateCostPence } from "@/lib/ai/provider";
import { reserveAiBudget, reconcileAiBudget, refundAiBudget } from "@/lib/ai/metering";
import { formatCurrency } from "@/lib/utils";
import { getEventMoney } from "@/lib/events/event-money";
import { detectRoomConflicts, type SetSlot } from "@/lib/events/scheduling";
import { typeMeta, riskItemsFor } from "@/lib/events/event-types";
import { computeCapacity, ratiosFor } from "@/lib/events/capacity";

export interface RunLink {
  label: string;
  href?: string;
  meta?: string;
}

export type RunResult =
  | { kind: "navigate"; href: string; text: string }
  | { kind: "list"; title: string; items: RunLink[] }
  | { kind: "message"; text: string }
  | { kind: "approval"; command: string; text: string }
  | { kind: "denied"; text: string };

const APP_SEGMENTS = new Set([
  "home", "events", "finance", "forms", "inbox", "leads", "library", "proposals",
  "reports", "rfqs", "settings", "suppliers", "tasks", "team", "venues", "venue-management", "calendar",
]);

const DONE_STATUSES = new Set(["completed", "done", "cancelled", "archived"]);

/**
 * Execution Router (Phase 2). Read + navigate commands execute for real and workspace-scoped;
 * mutating/AI commands return an approval preview (deterministic handlers land in Phase 2b).
 * Every call is gated by the aiCopilot flag and an active workspace.
 */
export async function runSlashCommand(id: string, args: Record<string, string>): Promise<RunResult> {
  const ctx = await getOptionalPersonaContext();
  if (!ctx.flags.aiCopilot) {
    return { kind: "denied", text: "Gala Copilot is available on the Scale plan and above." };
  }
  const cmd = SLASH_BY_ID[id];
  if (!cmd) return { kind: "message", text: `Unknown command /${id}. Type / to see what I can do.` };
  if (!ctx.workspaceId) return { kind: "denied", text: "No active workspace." };

  const supabase = await createClient();
  const ws = ctx.workspaceId;

  // ── Navigate ──────────────────────────────────────────
  if (id === "go") {
    const raw = (args.target ?? args._ ?? "").toLowerCase().replace(/^\//, "").trim();
    const seg = raw.split("/")[0];
    if (APP_SEGMENTS.has(seg)) {
      let href = `/event-manager/${raw}`;
      if (args.filter) href += `?${encodeURI(args.filter)}`;
      return { kind: "navigate", href, text: `Opening ${seg}…` };
    }
    return { kind: "message", text: 'I can open: events, suppliers, finance, calendar, tasks, leads, venues. Try "/go events".' };
  }

  // ── Find suppliers (read) ─────────────────────────────
  if (id === "find-suppliers") {
    let q = supabase
      .from("suppliers")
      .select("id, name, rating_internal, status")
      .eq("workspace_id", ws)
      .order("rating_internal", { ascending: false, nullsFirst: false })
      .limit(8);
    const min = Number(args.minRating);
    if (!Number.isNaN(min)) q = q.gte("rating_internal", min);
    const { data, error } = await q;
    if (error) return { kind: "message", text: "Couldn't load suppliers just now." };
    if (!data?.length) return { kind: "message", text: "No suppliers found yet — add one from the Suppliers section." };
    return {
      kind: "list",
      title: "Suppliers",
      items: data.map((s) => ({
        label: s.name,
        href: `/event-manager/suppliers/${s.id}`,
        meta: s.rating_internal != null ? `★ ${s.rating_internal}` : undefined,
      })),
    };
  }

  // ── What's overdue (read) ─────────────────────────────
  if (id === "overdue") {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, due_at, status")
      .eq("workspace_id", ws)
      .lt("due_at", nowIso)
      .order("due_at", { ascending: true })
      .limit(20);
    if (error) return { kind: "message", text: "Couldn't load tasks just now." };
    const open = (data ?? []).filter((t) => !DONE_STATUSES.has(String(t.status)));
    if (!open.length) return { kind: "message", text: "Nothing overdue — you're on top of it. 🎉" };
    return {
      kind: "list",
      title: `${open.length} overdue task${open.length === 1 ? "" : "s"}`,
      items: open.slice(0, 10).map((t) => ({ label: t.title, href: `/event-manager/tasks/${t.id}` })),
    };
  }

  // ── Create task (mutate — executes; low risk) ─────────
  if (id === "create-task") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "denied", text: "Please sign in to create tasks." };

    const title = (args.title ?? args._ ?? "").trim();
    if (!title) return { kind: "message", text: 'What should the task be called? Try /create-task title:"Confirm caterer".' };

    // Resolve (or create) the default workspace task list — tasks.list_id is NOT NULL.
    let listId: string | null = null;
    const { data: list } = await supabase
      .from("task_lists")
      .select("id")
      .eq("workspace_id", ws)
      .eq("kind", "workspace")
      .is("archived_at", null)
      .order("sort", { ascending: true })
      .limit(1)
      .maybeSingle();
    listId = list?.id ?? null;
    if (!listId) {
      const { data: created } = await supabase
        .from("task_lists")
        .insert({ workspace_id: ws, created_by: user.id, kind: "workspace", name: "General" })
        .select("id")
        .single();
      listId = created?.id ?? null;
    }
    if (!listId) return { kind: "message", text: "Couldn't set up a task list just now." };

    const due = args.due ? new Date(args.due) : null;
    const dueIso = due && !Number.isNaN(due.getTime()) ? due.toISOString() : null;

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        workspace_id: ws,
        created_by: user.id,
        list_id: listId,
        title,
        status: "todo",
        priority: "p3",
        due_at: dueIso,
        event_id: args.event ?? null,
      })
      .select("id")
      .single();
    if (error || !task) return { kind: "message", text: "Couldn't create the task just now." };

    revalidatePath("/event-manager/tasks");
    return { kind: "list", title: `Created task "${title}"`, items: [{ label: "Open task", href: `/event-manager/tasks/${task.id}` }] };
  }

  // ── Create lead (mutate — executes) ───────────────────
  if (id === "create-lead") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "denied", text: "Please sign in to create leads." };

    const client = (args.client ?? args._ ?? "").trim();
    if (!client) return { kind: "message", text: 'Who is the enquiry from? Try /create-lead client:"Acme Corp" eventType:"Awards dinner".' };

    const eventType = args.eventType ?? args.type ?? null;
    const title = `${eventType ?? "Enquiry"} — ${client}`;
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(args.date ?? "") ? args.date : null;
    const budget = Number(args.budget);

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        workspace_id: ws,
        created_by: user.id,
        title,
        client_name: client,
        event_type: eventType,
        event_date: eventDate,
        budget_estimate_cents: Number.isNaN(budget) ? null : Math.round(budget * 100),
      })
      .select("id")
      .single();
    if (error || !lead) return { kind: "message", text: "Couldn't create the lead just now." };

    revalidatePath("/event-manager/leads");
    return { kind: "list", title: `Created lead "${title}"`, items: [{ label: "Open lead", href: `/event-manager/leads/${lead.id}` }] };
  }

  // ── Draft email (AI — draft only, never sends) ────────
  if (id === "draft-email") {
    const to = args.to ?? "";
    const about = (args.about ?? args._ ?? "").trim();
    if (!about) return { kind: "message", text: 'What should the email cover? Try /draft-email to:"client" about:"thank them for confirming the date".' };

    const reservation = await reserveAiBudget(ws, "email_draft", 1);
    if (reservation?.blocked) {
      return { kind: "message", text: "You've reached this month's AI budget. It resets next month — or raise the cap in Settings → AI." };
    }
    try {
      const res = await chatComplete(
        [
          {
            role: "system",
            content:
              "You are Gala Dock Copilot. Draft a concise, warm, professional UK-English email for an event organiser. Output only the email as 'Subject: …' then the body. Do NOT send it — it is a draft for the user to review.",
          },
          { role: "user", content: `Draft an email to ${to || "the recipient"} about: ${about}.` },
        ],
        { tier: "fast", maxTokens: 400 }
      );
      if (reservation) {
        await reconcileAiBudget(reservation.ledgerId, 1, Math.ceil(estimateCostPence(res.usage)), res.usage.promptTokens, res.usage.completionTokens);
      }
      return { kind: "message", text: `Draft (review before sending):\n\n${res.content}` };
    } catch {
      if (reservation) await refundAiBudget(reservation.ledgerId, 1);
      return { kind: "message", text: "Couldn't draft the email just now." };
    }
  }

  // ── Event line-up / set times (read) ──────────────────
  if (id === "event-lineup") {
    const eventId = (args.event ?? args._ ?? "").trim();
    if (!eventId) return { kind: "message", text: "Which event? Try /event-lineup event:<id>." };
    const { data: ev } = await supabase.from("events").select("id, name").eq("workspace_id", ws).eq("id", eventId).maybeSingle();
    if (!ev) return { kind: "message", text: "I couldn't find that event in your workspace." };

    const [setsRes, actsRes, roomsRes] = await Promise.all([
      supabase.from("event_act_sets").select("id, act_id, room_id, label, starts_at, ends_at").eq("workspace_id", ws).eq("event_id", eventId).is("deleted_at", null).order("starts_at", { ascending: true }),
      supabase.from("event_acts").select("id, name").eq("workspace_id", ws).eq("event_id", eventId),
      supabase.from("event_rooms").select("id, name").eq("workspace_id", ws).eq("event_id", eventId),
    ]);
    const sets = setsRes.data ?? [];
    if (!sets.length) return { kind: "message", text: `${ev.name} has no set times yet. Add rooms + acts to build the line-up.` };

    const actName = new Map((actsRes.data ?? []).map((a) => [a.id, a.name]));
    const roomName = new Map((roomsRes.data ?? []).map((r) => [r.id, r.name]));
    const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

    const slots: SetSlot[] = sets.map((s) => ({ id: s.id, roomId: s.room_id, startsAt: s.starts_at, endsAt: s.ends_at }));
    const conflicts = detectRoomConflicts(slots);
    const clashIds = new Set(conflicts.flatMap((c) => [c.aId, c.bId]));

    const lines = sets.map((s) => {
      const who = s.act_id ? actName.get(s.act_id) ?? s.label ?? "TBC" : s.label ?? "TBC";
      const where = s.room_id ? roomName.get(s.room_id) ?? "—" : "—";
      return `• ${hm(s.starts_at)}–${hm(s.ends_at)} ${where}: ${who}${clashIds.has(s.id) ? " ⚠️ clash" : ""}`;
    });
    const header = `${ev.name} — line-up${conflicts.length ? ` (${conflicts.length} clash${conflicts.length === 1 ? "" : "es"})` : ""}:`;
    return { kind: "message", text: [header, ...lines].join("\n") };
  }

  // ── Event risks (list, or generate register from type) ─
  if (id === "event-risks") {
    const eventId = (args.event ?? args._ ?? "").trim();
    if (!eventId) return { kind: "message", text: "Which event? Try /event-risks event:<id>." };
    const { data: ev } = await supabase.from("events").select("id, name, event_type").eq("workspace_id", ws).eq("id", eventId).maybeSingle();
    if (!ev) return { kind: "message", text: "I couldn't find that event in your workspace." };

    const { data: existing } = await supabase
      .from("event_risks")
      .select("id, title, likelihood, impact, status")
      .eq("workspace_id", ws)
      .eq("event_id", eventId)
      .is("deleted_at", null);

    if (existing && existing.length) {
      const sorted = [...existing].sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact);
      const lines = sorted.map((r) => `• ${r.title} — score ${r.likelihood * r.impact} [${r.status}]`);
      return { kind: "message", text: [`${ev.name} — ${sorted.length} risks:`, ...lines.slice(0, 15)].join("\n") };
    }

    // Generate the register from the event-type risk template.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "denied", text: "Please sign in." };
    const category = ev.event_type ? typeMeta(ev.event_type)?.category ?? "other" : "other";
    const items = riskItemsFor(category);
    const { error } = await supabase
      .from("event_risks")
      .insert(items.map((t) => ({ workspace_id: ws, event_id: eventId, title: t, category, created_by: user.id })));
    if (error) return { kind: "message", text: "Couldn't build the risk register just now." };
    revalidatePath(`/event-manager/events/${eventId}`);
    return { kind: "message", text: `Built a ${items.length}-point risk register for ${ev.name} from the ${category} template:\n${items.map((t) => `• ${t}`).join("\n")}` };
  }

  // ── Event capacity / safety (read) ────────────────────
  if (id === "event-capacity") {
    const eventId = (args.event ?? args._ ?? "").trim();
    if (!eventId) return { kind: "message", text: "Which event? Try /event-capacity event:<id>." };
    const { data: ev } = await supabase
      .from("events")
      .select("id, name, event_type, guest_count_day, guest_count_evening")
      .eq("workspace_id", ws)
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return { kind: "message", text: "I couldn't find that event in your workspace." };

    const [roomsRes, guestsRes, ticketsRes, staffRes] = await Promise.all([
      supabase.from("event_rooms").select("capacity").eq("workspace_id", ws).eq("event_id", eventId),
      supabase.from("event_guests").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("event_id", eventId),
      supabase.from("ticket_types").select("sold").eq("workspace_id", ws).eq("event_id", eventId),
      supabase.from("event_staff_assignments").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("event_id", eventId),
    ]);

    const roomCap = (roomsRes.data ?? []).reduce((a, r) => a + (r.capacity ?? 0), 0);
    const capacity = roomCap || ev.guest_count_day || ev.guest_count_evening || 0;
    const ticketsSold = (ticketsRes.data ?? []).reduce((a, t) => a + (t.sold ?? 0), 0);
    const headcount = (guestsRes.count ?? 0) + ticketsSold;
    const staffCount = staffRes.count ?? 0;
    const category = ev.event_type ? typeMeta(ev.event_type)?.category ?? "other" : "other";

    const r = computeCapacity({ capacity, headcount, staffCount }, ratiosFor(category));
    const lines = [
      `${ev.name} — capacity & safety:`,
      `• Capacity: ${capacity || "not set"}`,
      `• Attendees: ${headcount}${capacity ? ` (${r.occupancyPct}%)` : ""}`,
      `• Stewards: ${staffCount} (recommended ${r.recommendedStaff})`,
      r.warnings.length ? `⚠️ ${r.warnings.join(" ")}` : "✅ Within safe limits.",
    ];
    return { kind: "message", text: lines.join("\n") };
  }

  // ── Event finance / P&L (read) ────────────────────────
  if (id === "event-pnl") {
    const eventId = (args.event ?? args._ ?? "").trim();
    if (!eventId) return { kind: "message", text: "Which event? Try /event-pnl event:<id>." };
    const { data: ev } = await supabase.from("events").select("id, name").eq("workspace_id", ws).eq("id", eventId).maybeSingle();
    if (!ev) return { kind: "message", text: "I couldn't find that event in your workspace." };

    const money = await getEventMoney(ws, eventId);
    const p = money.profitability;
    const f = (c: number) => formatCurrency(c / 100);

    const lines = [
      `${ev.name} — finance:`,
      `• Revenue: ${f(p.estRevenueCents)} (confirmed ${f(p.confirmedRevenueCents)})`,
      `• Costs: ${f(p.estCostCents)} (confirmed ${f(p.confirmedCostCents)})`,
      `• Profit before split: ${f(p.profitBeforeSplitCents)} (margin ${(p.marginPct * 100).toFixed(0)}%)`,
      `• Break-even revenue: ${f(p.breakEvenRevenueCents)}`,
      `• Deposits: ${f(money.deposits.totalCents)} (paid ${f(money.deposits.paidCents)}, refundable ${f(money.deposits.refundableCents)})`,
    ];
    if (p.splitPayouts.length) {
      lines.push(`• Splits: ${p.splitPayouts.map((s) => `${s.name} ${f(s.amountCents)}`).join(", ")}`);
      lines.push(`• Profit after split: ${f(p.profitAfterSplitCents)}`);
    }
    return { kind: "message", text: lines.join("\n") };
  }

  // ── Log incident (mutate) ─────────────────────────────
  if (id === "log-incident") {
    const eventId = (args.event ?? "").trim();
    const title = (args.title ?? args._ ?? "").trim();
    if (!eventId || !title) return { kind: "message", text: 'Need an event and a title. Try /log-incident event:<id> title:"Medical — guest fainted" severity:high category:medical.' };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "denied", text: "Please sign in." };
    const { data: ev } = await supabase.from("events").select("id").eq("workspace_id", ws).eq("id", eventId).maybeSingle();
    if (!ev) return { kind: "message", text: "I couldn't find that event in your workspace." };

    const severity = ["low", "medium", "high", "critical"].includes(args.severity) ? args.severity : "low";
    const category = ["medical", "security", "complaint", "safeguarding", "lost_property", "technical", "other"].includes(args.category) ? args.category : "other";
    const { data: inc, error } = await supabase
      .from("event_incidents")
      .insert({ workspace_id: ws, event_id: eventId, title, severity, category, created_by: user.id })
      .select("id")
      .single();
    if (error || !inc) return { kind: "message", text: "Couldn't log the incident just now." };
    revalidatePath(`/event-manager/events/${eventId}`);
    return { kind: "list", title: `Logged ${severity} ${category} incident`, items: [{ label: title, href: `/event-manager/events/${eventId}` }] };
  }

  // ── Event settlement statement (read) ─────────────────
  if (id === "event-settlement") {
    const eventId = (args.event ?? args._ ?? "").trim();
    if (!eventId) return { kind: "message", text: "Which event? Try /event-settlement event:<id>." };
    const { data: ev } = await supabase.from("events").select("id, name").eq("workspace_id", ws).eq("id", eventId).maybeSingle();
    if (!ev) return { kind: "message", text: "I couldn't find that event in your workspace." };

    const money = await getEventMoney(ws, eventId);
    const p = money.profitability;
    const f = (c: number) => formatCurrency(c / 100);
    const lines = [
      `${ev.name} — settlement (draft):`,
      `• Gross revenue: ${f(p.estRevenueCents)}`,
      `• Total costs: ${f(p.estCostCents)}`,
      `• Deposits: ${f(money.deposits.totalCents)} (refundable ${f(money.deposits.refundableCents)})`,
      `• Profit before split: ${f(p.profitBeforeSplitCents)}`,
      ...p.splitPayouts.map((s) => `   – ${s.name}: ${f(s.amountCents)}`),
      `• Net after splits: ${f(p.profitAfterSplitCents)}`,
    ];
    return { kind: "message", text: lines.join("\n") };
  }

  // ── Analyse event (grounded AI read) ──────────────────
  if (id === "analyse-event") {
    const eventId = (args.event ?? args._ ?? "").trim();
    if (!eventId) return { kind: "message", text: "Which event? Open an event and run /analyse-event event:<id>." };

    const { data: ev } = await supabase
      .from("events")
      .select("id, name, status, start_at, venue_name_snapshot, client_name")
      .eq("workspace_id", ws)
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return { kind: "message", text: "I couldn't find that event in your workspace." };

    const { data: tasks } = await supabase
      .from("event_tasks")
      .select("status")
      .eq("workspace_id", ws)
      .eq("event_id", eventId);
    const total = tasks?.length ?? 0;
    const done = (tasks ?? []).filter((t) => ["done", "completed"].includes(String(t.status))).length;
    const { count: supCount } = await supabase
      .from("event_suppliers")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws)
      .eq("event_id", eventId);

    const reservation = await reserveAiBudget(ws, "brief_draft", 1);
    if (reservation?.blocked) return { kind: "message", text: "You've reached this month's AI budget. It resets next month — or raise the cap in Settings → AI." };
    try {
      const res = await chatComplete(
        [
          {
            role: "system",
            content:
              "You are Gala Dock Copilot. Given an event snapshot, reply with 2-3 short bullets on status/risks and 2-3 recommended next actions. UK English, concise. Do not invent data beyond the snapshot.",
          },
          {
            role: "user",
            content: `Event: ${ev.name} [${ev.status}]${ev.start_at ? `, date ${ev.start_at.slice(0, 10)}` : ""}${
              ev.venue_name_snapshot ? `, venue ${ev.venue_name_snapshot}` : ""
            }${ev.client_name ? `, client ${ev.client_name}` : ""}. Tasks ${done}/${total} complete. Suppliers assigned: ${supCount ?? 0}.`,
          },
        ],
        { tier: "fast", maxTokens: 350 }
      );
      if (reservation) await reconcileAiBudget(reservation.ledgerId, 1, Math.ceil(estimateCostPence(res.usage)), res.usage.promptTokens, res.usage.completionTokens);
      return { kind: "message", text: `${ev.name} — analysis:\n\n${res.content}` };
    } catch {
      if (reservation) await refundAiBudget(reservation.ledgerId, 1);
      return { kind: "message", text: "Couldn't analyse that event just now." };
    }
  }

  // ── Mutating / AI commands → approval preview ─────────
  const argStr = Object.entries(args)
    .filter(([k]) => k !== "_")
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return {
    kind: "approval",
    command: `/${id}`,
    text: `Ready to run ${cmd.label.toLowerCase()}${argStr ? ` (${argStr})` : ""}. ${
      cmd.requiresApproval ? "This changes records, so I'll ask you to confirm before it runs." : ""
    } Deterministic execution for this command is wiring up in the next phase.`,
  };
}
