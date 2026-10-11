"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { parseCredential, verifySignature } from "./credentials";

// Check-in (§51, media §78). Every outcome is decided server-side by scan_ticket (event access via RLS-equivalent checks);
// signatures are verified here with the server-only secret. Offline scans are replayed through the same path on reconnect.
export type ScanOutcome = "admitted" | "readmitted" | "duplicate" | "invalid" | "revoked" | "refunded" | "transferred" | "resold" | "wrong_event" | "wrong_session" | "resale_locked";
export type ScanReply = { ok: true; result: ScanOutcome; code?: string; attendee?: string | null; tier?: string | null; seat?: string | null; history?: { result: string; at: string; gate: string | null }[] } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function scanCredential(eventId: string, raw: string, opts: { device?: string; offlineAt?: string; gate?: string } = {}): Promise<ScanReply> {
  if (!UUID.test(eventId)) return { ok: false, error: "Invalid event." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!(await rateLimit(`scan:${user.id}`, 900, 60))) return { ok: false, error: "Too many scans — slow down." };
  const p = parseCredential(raw);
  let args: { p_ticket: string | null; p_code: string | null; p_nonce: string | null; p_credential: string };
  if (p.kind === "wallet" || p.kind === "print") {
    const admin = untyped(createAdminClient() as never);
    const { data: t } = await admin.from("tickets").select("qr_nonce,event_id").eq("id", p.ticketId).maybeSingle();
    let nonce: string | null = t?.qr_nonce ?? null;
    if (t && p.kind === "print") {
      const { data: ev } = await admin.from("events").select("settings").eq("id", t.event_id).maybeSingle();
      if ((ev?.settings as { print_tickets?: boolean } | null)?.print_tickets === false) nonce = null;   // printing disabled → print credentials refused
    }
    // A bad or stale signature is sent with a non-matching nonce so the DB reports *why* (transferred / resold / invalid).
    const valid = !!nonce && verifySignature(p, nonce, opts.offlineAt ? Date.parse(opts.offlineAt) : Date.now());
    args = { p_ticket: t ? p.ticketId : null, p_code: null, p_nonce: valid ? nonce : "stale-or-forged", p_credential: p.kind };
  } else if (p.kind === "legacy") args = { p_ticket: null, p_code: p.code, p_nonce: p.nonce, p_credential: "legacy" };
  else if (p.kind === "manual") args = { p_ticket: null, p_code: p.code, p_nonce: null, p_credential: "manual" };
  else return { ok: true, result: "invalid" };
  const { data, error } = await sb.rpc("scan_ticket" as never, { p_event: eventId, ...args, p_device: opts.device?.slice(0, 60) ?? null,
    p_offline_at: opts.offlineAt && !Number.isNaN(Date.parse(opts.offlineAt)) ? new Date(opts.offlineAt).toISOString() : null, p_gate: opts.gate?.slice(0, 60) ?? null } as never);
  if (error) return { ok: false, error: /not_authorized|42501/.test(error.message) ? "You don’t have check-in access for this event." : "Check-in failed — try again." };
  const r = data as { result: ScanOutcome; code: string | null; attendee: string | null; tier: string | null; seat: string | null; history: { result: string; at: string; gate: string | null }[] };
  return { ok: true, result: r.result, code: r.code ?? undefined, attendee: r.attendee, tier: r.tier, seat: r.seat, history: r.history };
}

export type ManifestRow = { ticket_id: string; code: string; status: string; attendee: string | null; tier: string | null; seat: string | null; checked_in_at: string | null };
/** Offline manifest: identities and statuses only — no nonces or signing material ever leave the server. */
export async function scanManifest(eventId: string): Promise<{ ok: true; rows: ManifestRow[]; at: string } | { ok: false; error: string }> {
  if (!UUID.test(eventId)) return { ok: false, error: "Invalid event." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("scan_manifest" as never, { p_event: eventId } as never);
  if (error) return { ok: false, error: "Couldn’t download the guest list." };
  return { ok: true, rows: (data ?? []) as ManifestRow[], at: new Date().toISOString() };
}

export async function scanLookup(eventId: string, q: string) {
  if (!UUID.test(eventId) || q.trim().length < 2) return [] as { ticket_id: string; code: string; status: string; attendee: string; email: string; tier: string; seat: string | null; checked_in_at: string | null }[];
  const sb = await createClient();
  const { data } = await sb.rpc("scan_lookup" as never, { p_event: eventId, p_query: q.trim().slice(0, 60) } as never);
  return (data ?? []) as { ticket_id: string; code: string; status: string; attendee: string; email: string; tier: string; seat: string | null; checked_in_at: string | null }[];
}

/** Reconciliation after reconnecting: replays queued offline scans in order; the server decides each outcome. */
export async function syncOfflineScans(eventId: string, scans: { payload: string; at: string; device?: string; local: string }[]) {
  const out: { at: string; local: string; server: ScanReply }[] = [];
  for (const s of scans.slice(0, 500).sort((a, b) => a.at.localeCompare(b.at))) out.push({ at: s.at, local: s.local, server: await scanCredential(eventId, s.payload, { offlineAt: s.at, device: s.device }) });
  return out;
}
