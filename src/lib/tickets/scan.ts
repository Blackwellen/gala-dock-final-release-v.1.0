"use server";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { rateLimit } from "@/lib/security";
import { parseCredential, verifySignature, printFingerprint, signSnapshot, verifySnapshot } from "./credentials";

// Check-in (§51, media §78; Q18/Q21). Every outcome is decided server-side by scan_admission (role-scoped scan permission,
// credential nonce, ticket/pass status, session window, zone membership + window, re-entry, offline conflicts) in one
// row-locked transaction. Signatures are verified here with the server-only secret. Offline scans replay through the same
// path on reconnect, idempotently (client scan id) and with the snapshot they were taken against.
export type ScanOutcome = "admitted" | "readmitted" | "duplicate" | "invalid" | "revoked" | "refunded" | "transferred" | "resold" | "wrong_event" | "wrong_session" | "resale_locked"
  | "wrong_zone" | "outside_window" | "reentry_denied" | "suspended" | "expired" | "exited" | "pass_not_valid_here" | "online_only_ticket";
export type ScanReply = { ok: true; result: ScanOutcome; reason?: string; conflict?: string | null; code?: string; attendee?: string | null; tier?: string | null; seat?: string | null; zone?: string | null;
  history?: { result: string; at: string; gate: string | null }[] } | { ok: false; error: string };
export type ScanOptions = { device?: string; offlineAt?: string; gate?: string; zoneId?: string; clientScanId?: string; snapshotId?: string; localResult?: string; direction?: "in" | "out" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Args = { p_ticket: string | null; p_pass: string | null; p_code: string | null; p_nonce: string | null; p_credential: string };

/** Resolves a raw scan to RPC arguments. Bad or stale signatures are sent with a non-matching nonce so the DB says *why*. */
async function resolve(raw: string, at: number): Promise<Args | null> {
  const p = parseCredential(raw);
  const admin = untyped(createAdminClient() as never);
  if (p.kind === "wallet" || p.kind === "print") {
    const { data: t } = await admin.from("tickets").select("qr_nonce,print_epoch,event_id").eq("id", p.ticketId).maybeSingle();
    let nonce: string | null = t?.qr_nonce ?? null;
    if (t && p.kind === "print") {
      const { data: ev } = await admin.from("events").select("settings").eq("id", t.event_id).maybeSingle();
      if ((ev?.settings as { print_tickets?: boolean } | null)?.print_tickets === false) nonce = null;   // printing disabled → print credentials refused
    }
    const valid = !!nonce && verifySignature(p, nonce, at, Number(t?.print_epoch ?? 0));
    return { p_ticket: t ? p.ticketId : null, p_pass: null, p_code: null, p_nonce: valid ? nonce : "stale-or-forged", p_credential: p.kind };
  }
  if (p.kind === "badge") {
    const { data: x } = await admin.from("access_passes").select("nonce").eq("id", p.passId).maybeSingle();
    const valid = !!x?.nonce && verifySignature(p, x.nonce, at);
    return { p_ticket: null, p_pass: x ? p.passId : null, p_code: x ? null : "GDP-UNKNOWN", p_nonce: valid ? x!.nonce : "stale-or-forged", p_credential: "pass" };
  }
  if (p.kind === "legacy") return { p_ticket: null, p_pass: null, p_code: p.code, p_nonce: p.nonce, p_credential: "legacy" };
  if (p.kind === "manual") return { p_ticket: null, p_pass: null, p_code: p.code, p_nonce: null, p_credential: p.code.startsWith("GDP-") ? "pass" : "manual" };
  return null;
}

export async function scanCredential(eventId: string, raw: string, opts: ScanOptions = {}): Promise<ScanReply> {
  if (!UUID.test(eventId) || (opts.zoneId && !UUID.test(opts.zoneId)) || (opts.snapshotId && !UUID.test(opts.snapshotId))) return { ok: false, error: "Invalid event." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!(await rateLimit(`scan:${user.id}`, 900, 60))) return { ok: false, error: "Too many scans — slow down." };
  const offline = opts.offlineAt && !Number.isNaN(Date.parse(opts.offlineAt)) ? new Date(opts.offlineAt).toISOString() : null;
  const args = await resolve(raw, offline ? Date.parse(offline) : Date.now());
  if (!args) return { ok: true, result: "invalid", reason: "Not a Gala Dock code." };
  const { data, error } = await untyped(sb).rpc("scan_admission", { p_event: eventId, p_zone: opts.zoneId ?? null, ...args, p_device: opts.device?.slice(0, 60) ?? null,
    p_offline_at: offline, p_gate: opts.gate?.slice(0, 60) ?? null, p_client_scan_id: opts.clientScanId?.slice(0, 80) ?? null, p_snapshot: opts.snapshotId ?? null,
    p_local_result: opts.localResult?.slice(0, 30) ?? null, p_direction: opts.direction ?? "in" });
  if (error) return { ok: false, error: /not_authorized|42501/.test(error.message) ? "You don’t have check-in access for this event or zone." : /invalid_offline_time/.test(error.message) ? "This offline scan's time is out of range." : /zone_not_in_event/.test(error.message) ? "That zone isn't part of this event." : "Check-in failed — try again." };
  const r = data as { result: ScanOutcome; reason: string; conflict: string | null; code: string | null; attendee: string | null; tier: string | null; seat: string | null; zone: string | null; history: { result: string; at: string; gate: string | null }[] };
  return { ok: true, result: r.result, reason: r.reason, conflict: r.conflict, code: r.code ?? undefined, attendee: r.attendee, tier: r.tier, seat: r.seat, zone: r.zone, history: r.history };
}

export type ManifestRow = { ticket_id: string; code: string; status: string; attendee: string | null; tier: string | null; seat: string | null; checked_in_at: string | null; pf?: string };
export type Snapshot = { id: string; expires_at: string; signature: string; canonical: string };
/**
 * Offline allow-list: identities, statuses and zone rules only — no nonces or signing material ever leave the server. Printed
 * codes can be checked offline by fingerprint (pf = SHA-256 prefix of the print signature). The payload is HMAC-signed with
 * the server-only secret and recorded (scan_snapshots) so queued scans are reconciled against a snapshot the server issued.
 */
export async function scanManifest(eventId: string, device = ""): Promise<{ ok: true; rows: ManifestRow[]; at: string; snapshot: Snapshot; zones: unknown[]; passes: unknown[] } | { ok: false; error: string }> {
  if (!UUID.test(eventId)) return { ok: false, error: "Invalid event." };
  const sb = await createClient();
  const { data, error } = await untyped(sb).rpc("create_scan_snapshot", { p_event: eventId, p_device: device.slice(0, 60) });
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "You don’t have check-in access for this event." : "Couldn’t download the guest list." };
  const snap = data as { snapshot_id: string; expires_at: string; issued_at: string; tickets: (ManifestRow & { v: number })[]; passes: unknown[]; zones: unknown[] };
  const ids = snap.tickets.map(t => t.ticket_id);
  const keys = new Map<string, { n: string; e: number }>();
  const admin = untyped(createAdminClient() as never);
  for (let i = 0; i < ids.length; i += 500) {
    const { data: ns } = await admin.from("tickets").select("id,qr_nonce,print_epoch").in("id", ids.slice(i, i + 500));
    for (const x of (ns ?? []) as { id: string; qr_nonce: string; print_epoch: number }[]) keys.set(x.id, { n: x.qr_nonce, e: x.print_epoch ?? 0 });
  }
  const rows: ManifestRow[] = snap.tickets.map(t => { const k = keys.get(t.ticket_id); return { ticket_id: t.ticket_id, code: t.code, status: t.status, attendee: t.attendee, tier: t.tier, seat: t.seat, checked_in_at: t.checked_in_at,
    ...(k && t.status === "valid" ? { pf: printFingerprint(t.ticket_id, k.n, k.e) } : {}) }; });
  const canonical = JSON.stringify({ id: snap.snapshot_id, event: eventId, issued_at: snap.issued_at, expires_at: snap.expires_at, n: rows.length,
    digest: createHash("sha256").update(JSON.stringify(rows.map(r => [r.ticket_id, r.status, r.pf ?? ""]))).digest("base64url") });
  return { ok: true, rows, at: snap.issued_at, zones: snap.zones, passes: snap.passes, snapshot: { id: snap.snapshot_id, expires_at: snap.expires_at, signature: signSnapshot(canonical), canonical } };
}

export async function scanLookup(eventId: string, q: string) {
  if (!UUID.test(eventId) || q.trim().length < 2) return [] as { ticket_id: string; code: string; status: string; attendee: string; email: string; tier: string; seat: string | null; checked_in_at: string | null }[];
  const sb = await createClient();
  const { data } = await sb.rpc("scan_lookup" as never, { p_event: eventId, p_query: q.trim().slice(0, 60) } as never);
  return (data ?? []) as { ticket_id: string; code: string; status: string; attendee: string; email: string; tier: string; seat: string | null; checked_in_at: string | null }[];
}

/** Guest-list (no ticket) admission by the door team. */
export async function checkInGuest(eventId: string, guestId: string, zoneId?: string) {
  if (!UUID.test(eventId) || !UUID.test(guestId) || (zoneId && !UUID.test(zoneId))) return { ok: false as const, error: "Invalid guest." };
  const { data, error } = await untyped(await createClient()).rpc("check_in_guest", { p_event: eventId, p_guest: guestId, p_zone: zoneId ?? null, p_device: null });
  if (error) return { ok: false as const, error: /not_authorized/.test(error.message) ? "You don’t have check-in access for this event." : "Check-in failed — try again." };
  return { ok: true as const, ...(data as { result: string; reason: string; name: string | null }) };
}

/**
 * Reconciliation after reconnecting. Each queued scan replays through scan_admission with its offline time, the device's own
 * verdict and a stable client scan id (retries never double-count). Conflicts are resolved in the database deterministically —
 * the first valid scan by time wins, later ones are flagged duplicate, and a device admission the server rejects (refunded,
 * transferred, revoked after the snapshot) is flagged for review — so the outcome doesn't depend on which device syncs first.
 */
export async function syncOfflineScans(eventId: string, scans: { payload: string; at: string; device?: string; local: string; zoneId?: string }[], snapshot?: Snapshot) {
  let snapshotId: string | undefined;
  if (snapshot) {
    const parsed = (() => { try { return JSON.parse(snapshot.canonical) as { id: string; event: string }; } catch { return null; } })();
    if (!parsed || parsed.event !== eventId || parsed.id !== snapshot.id || !verifySnapshot(snapshot.canonical, snapshot.signature)) return [{ at: "", local: "", server: { ok: false, error: "The offline guest list was altered or belongs to another event — scans not synced." } as ScanReply }];
    const { data: ok } = await untyped(await createClient()).rpc("scan_snapshot_valid", { p_snapshot: snapshot.id, p_event: eventId });
    if (!ok) return [{ at: "", local: "", server: { ok: false, error: "This offline guest list wasn't issued to you for this event." } as ScanReply }];
    snapshotId = snapshot.id;
  }
  const out: { at: string; local: string; server: ScanReply }[] = [];
  const ordered = scans.slice(0, 500).sort((a, b) => a.at.localeCompare(b.at) || (a.device ?? "").localeCompare(b.device ?? "") || a.payload.localeCompare(b.payload));
  for (const s of ordered) {
    const clientScanId = createHash("sha256").update(`${s.device ?? ""}|${s.at}|${s.payload}`).digest("base64url").slice(0, 40);
    out.push({ at: s.at, local: s.local, server: await scanCredential(eventId, s.payload, { offlineAt: s.at, device: s.device, zoneId: s.zoneId, clientScanId, snapshotId, localResult: s.local }) });
  }
  return out;
}
