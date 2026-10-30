import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Entitlement-gated join (Q29, domain 183). The provider link never appears on a page: the server issues a 2-minute single-use
 * join token (virtual_issue_join_token: ticket / registration / speaker-moderator-host role / event team, window, capacity,
 * device limit, rotation) and redeems it at once (virtual_redeem_join_token re-validates incl. the ticket's credential version),
 * then redirects with no-store / no-referrer. A per-browser device id (httpOnly cookie) drives the device/concurrency limit.
 */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_COOKIE = "gd_vdev";

export const JOIN_REASON: Record<string, string> = {
  not_your_ticket: "This ticket isn’t in your account.", not_open_yet: "The session isn’t open yet.", ended: "This session has ended.",
  no_virtual_access: "This event doesn’t have an online session.", refunded: "This ticket was refunded.", cancelled: "This event, session or ticket was cancelled.",
  transferred: "This ticket was transferred to someone else.", resold: "This ticket was resold.", postponed: "This event has been postponed.",
  in_person_ticket: "Your ticket is for in-person entry only.", tier_not_included: "Your ticket type doesn’t include this session.",
  ticket_not_accepted: "This session needs a registration, not a ticket.", no_entitlement: "You need a ticket or an approved registration to join.",
  invite_only: "This session is invite-only.", device_limit: "Your ticket is already in use on another device. Leave there first, then try again.",
  session_full: "This session is full right now. Try again in a few minutes.", no_stream_link: "The organiser hasn’t added the stream link yet.",
  rate_limited: "Too many attempts — wait a minute and try again.", ticket_changed: "This ticket changed (refund or transfer). Its access was revoked.",
  registration_changed: "Your registration is no longer approved.", role_revoked: "Your speaker/host access was removed.", suspended: "This event is unavailable.",
  replay_expired: "The replay is no longer available.", not_available: "The replay isn’t available yet.", not_found: "Not found.",
};

export async function deviceId(): Promise<{ id: string; fresh: boolean }> {
  const jar = await cookies();
  const v = jar.get(DEVICE_COOKIE)?.value;
  if (v && /^[A-Za-z0-9_-]{16,64}$/.test(v)) return { id: v, fresh: false };
  return { id: randomBytes(18).toString("base64url"), fresh: true };
}

export function withDevice(res: NextResponse, d: { id: string; fresh: boolean }) {
  if (d.fresh) res.cookies.set(DEVICE_COOKIE, d.id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export type JoinResult = { ok: true; url: string; attendanceId: string; role: string } | { ok: false; reason: string; opensAt?: string };

export async function joinSession(sb: SupabaseClient, session: string, device: string, ticket?: string | null): Promise<JoinResult> {
  const issued = await sb.rpc("virtual_issue_join_token", { p_session: session, p_device: device, p_ticket: ticket ?? null });
  const i = (issued.data ?? { ok: false, reason: "no_virtual_access" }) as { ok: boolean; token?: string; reason?: string; opens_at?: string };
  if (issued.error || !i.ok || !i.token) return { ok: false, reason: i.reason ?? "no_virtual_access", opensAt: i.opens_at };
  const red = await sb.rpc("virtual_redeem_join_token", { p_token: i.token, p_device: device });
  const r = (red.data ?? { ok: false, reason: "no_virtual_access" }) as { ok: boolean; url?: string; attendance_id?: string; role?: string; reason?: string };
  if (red.error || !r.ok || !r.url) return { ok: false, reason: r.reason ?? "no_virtual_access" };
  return { ok: true, url: r.url, attendanceId: r.attendance_id ?? "", role: r.role ?? "attendee" };
}

export const SECRET_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export const reasonText = (reason?: string, opensAt?: string) =>
  `${JOIN_REASON[reason ?? ""] ?? "You can’t join this session."}${opensAt ? ` It opens ${new Date(opensAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })} (UK time).` : ""}`;
