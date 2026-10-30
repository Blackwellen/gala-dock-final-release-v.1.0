"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { opsError } from "@/lib/ops/errors";
import type { ActionResult } from "./shell";

/**
 * Operations › Logistics (Q25): transport, parking, accommodation, loading bays and windows. Each write is one database
 * command (migration 202610293016) that re-checks event authority, takes the relevant lock and raises machine errors.
 */
const MANAGE = ["owner", "admin", "manager"];
const Id = z.string().uuid();
const blank = z.union([z.literal(""), z.null()]).transform(() => undefined);
const opt = <T extends z.ZodTypeAny>(s: T) => z.union([blank, s.optional()]);
const iso = z.string().refine(v => !Number.isNaN(Date.parse(v)), "date");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const Transport = z.object({ kind: z.enum(["talent", "crew", "guest", "supplier", "shuttle", "vip"]).optional(), passengers: int(1, 500), from_place: z.string().trim().max(200).default(""),
  to_place: z.string().trim().max(200).default(""), pickup_point: z.string().trim().max(200).default(""), departs_at: iso, arrives_at: iso, party_id: opt(Id), crew_id: opt(Id),
  vehicle_equipment_id: opt(Id), vehicle_label: z.string().trim().max(120).default(""), public_info: z.boolean().default(false),
  status: opt(z.enum(["planned", "confirmed", "en_route", "completed", "cancelled"])), notes: z.string().max(1000).default(""),
  passenger_names: z.string().max(2000).default(""), flight_number: z.string().trim().max(40).default(""), contact_phone: z.string().trim().max(60).default("") });
const Area = z.object({ name: z.string().trim().min(1).max(120), kind: z.enum(["general", "staff", "supplier", "talent", "accessible", "vip", "mixed"]), capacity: int(0, 100000), accessible_spaces: int(0, 100000),
  opens_at: opt(iso), closes_at: opt(iso), access_route: z.string().max(500).default(""), status: opt(z.enum(["active", "closed"])) });
const Permit = z.object({ holder_kind: z.enum(["staff", "supplier", "talent", "guest", "vip", "accessible", "other"]), holder_name: z.string().trim().min(2).max(160), vehicle_reg: z.string().trim().max(16).default(""),
  accessible: z.boolean().default(false), valid_from: opt(iso), valid_to: opt(iso), party_id: opt(Id), crew_id: opt(Id) });
const Block = z.object({ hotel_name: z.string().trim().min(1).max(160), address: z.string().max(300).default(""), contact: z.string().max(200).default(""), rooms_total: int(1, 5000),
  check_in: day, check_out: day, cutoff_date: opt(day), nightly_rate: z.coerce.number().min(0).max(100000), status: opt(z.enum(["provisional", "confirmed", "released", "cancelled"])), notes: z.string().max(1000).default("") });
const Room = z.object({ occupant_kind: z.enum(["talent", "crew", "staff", "guest", "vip", "other"]), occupant_name: z.string().trim().min(2).max(160), party_id: opt(Id), crew_id: opt(Id),
  room_type: z.string().trim().max(60).default(""), nights_from: opt(day), nights_to: opt(day), status: z.enum(["held", "confirmed"]).default("held") });
const Bay = z.object({ name: z.string().trim().min(1).max(120), max_vehicle: z.string().trim().max(80).default(""), turnaround_minutes: int(0, 240), access_route: z.string().max(500).default("") });
const Window = z.object({ kind: z.enum(["delivery", "collection", "load_in", "load_out", "storage"]), bay_id: opt(Id), starts_at: iso, ends_at: iso, supplier_name: z.string().trim().max(160).default(""),
  party_id: opt(Id), vehicle: z.string().trim().max(80).default(""), storage_area: z.string().trim().max(160).default(""), status: opt(z.enum(["requested", "confirmed", "completed", "cancelled"])), notes: z.string().max(500).default("") });

export type LogisticsOp = "transport" | "area" | "permit" | "revoke" | "block" | "room" | "room_cancel" | "bay" | "window";
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const first = (e: z.ZodError) => { const k = String(e.issues[0]?.path[0] ?? ""); return k ? `Check “${k.replace(/_/g, " ")}”.` : "Check the details entered."; };

export async function logisticsCommand(eventId: string, op: LogisticsOp, ref: string | null, extra: Record<string, unknown>, values: Record<string, unknown> = {}): Promise<ActionResult> {
  const ctx = await getOrganizer();
  if (!Id.safeParse(eventId).success || (ref !== null && !Id.safeParse(ref).success)) return { ok: false, error: "Record not found." };
  if (!MANAGE.includes(String(ctx.role))) return { ok: false, error: "Only the event's owners and managers can change logistics." };
  const sb = untyped(ctx.supabase);
  const done = (message: string, data?: unknown): ActionResult => { revalidatePath(`/organizer/events/${eventId}`); return { ok: true, message, data }; };
  const res = async (fn: string, args: Record<string, unknown>, message: (d: Record<string, unknown>) => string) => {
    const r = await sb.rpc(fn, args); return r.error ? { ok: false, error: opsError(r.error) } : done(message((r.data ?? {}) as Record<string, unknown>));
  };
  switch (op) {
    case "transport": {
      const p = (ref ? Transport : Transport.extend({ kind: z.enum(["talent", "crew", "guest", "supplier", "shuttle", "vip"]) })).safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      if (Date.parse(p.data.arrives_at) <= Date.parse(p.data.departs_at)) return { ok: false, error: "Arrival must be after departure." };
      if (p.data.public_info && !["shuttle", "guest"].includes(String(p.data.kind ?? extra.kind ?? ""))) return { ok: false, error: "Only shuttle and guest movements can be shown to ticket holders." };
      const { passenger_names, flight_number, contact_phone, ...rest } = p.data;
      const body: Record<string, unknown> = { ...clean(rest), departs_at: new Date(rest.departs_at).toISOString(), arrives_at: new Date(rest.arrives_at).toISOString(), private: { passenger_names, flight_number, contact_phone } };
      if (ref) for (const k of ["party_id", "crew_id", "vehicle_equipment_id"] as const) body[k] = rest[k] ?? "";
      return res("transport_save", { p_event: eventId, p: body, p_id: ref }, d => `Movement saved${d.warning ? ` — note: ${String(d.warning)}` : ""}.`);
    }
    case "area": {
      const p = Area.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      if (p.data.accessible_spaces > p.data.capacity) return { ok: false, error: "Accessible spaces can't exceed the capacity." };
      return res("parking_area_save", { p_event: eventId, p: clean(p.data), p_id: ref }, () => ref ? "Parking area updated." : "Parking area added.");
    }
    case "permit": {
      const p = Permit.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      return res("parking_issue_permit", { p_area: ref, p: clean(p.data) }, d => `Permit ${String(d.code)} issued — ${String(d.remaining)} space(s) left for that time.`);
    }
    case "revoke": {
      const n = z.object({ note: z.string().trim().min(3).max(300) }).safeParse(values); if (!n.success) return { ok: false, error: "Add a short reason." };
      return res("parking_revoke_permit", { p_permit: ref, p_reason: n.data.note }, () => "Permit revoked.");
    }
    case "block": {
      const p = Block.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      if (p.data.check_out <= p.data.check_in) return { ok: false, error: "Check-out must be after check-in." };
      if (p.data.cutoff_date && p.data.cutoff_date > p.data.check_in) return { ok: false, error: "The cut-off must be on or before check-in." };
      return res("accommodation_block_save", { p_event: eventId, p: clean(p.data), p_id: ref }, d => ref ? `Room block updated (rate version ${String(d.rate_version)}).` : "Room block added.");
    }
    case "room": {
      const p = Room.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      return res("room_allocate", { p_block: ref, p: clean(p.data) }, d => `Room allocated — cost ${Number(d.cost).toFixed(2)} ${String(d.currency)} (rate snapshotted).`);
    }
    case "room_cancel": return res("room_cancel", { p_allocation: ref }, () => "Room allocation cancelled.");
    case "bay": {
      const p = Bay.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      return res("loading_bay_save", { p: { ...p.data, event_id: eventId }, p_id: ref }, () => "Event loading bay saved.");
    }
    case "window": {
      const p = Window.safeParse(values); if (!p.success) return { ok: false, error: first(p.error) };
      if (Date.parse(p.data.ends_at) <= Date.parse(p.data.starts_at)) return { ok: false, error: "The window must end after it starts." };
      const body: Record<string, unknown> = { ...clean(p.data), starts_at: new Date(p.data.starts_at).toISOString(), ends_at: new Date(p.data.ends_at).toISOString() };
      if (ref && !p.data.bay_id) body.bay_id = "";
      return res("logistics_window_book", { p_event: eventId, p: body, p_id: ref }, d => `Window ${String(d.status)} — bay busy until ${new Date(String(d.busy_until)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} (incl. turnaround).`);
    }
  }
  return { ok: false, error: "Unknown action." };
}
