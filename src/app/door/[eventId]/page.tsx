import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { clientIp, rateLimit } from "@/lib/security";
import { TicketScanner } from "@/components/tickets/scanner";

// Door scanner for outside door staff (lane D4 / B2). Sign-in required (requireUser keeps the return path → /login?next=/door/…);
// access is decided by can_scan_event / can_scan_event_any evaluated as the caller, so event_scanners rows (zones, expiry,
// revocation) apply exactly as they do at scan time. Only the event name is read with the service role, after that check.
// The scanner itself shows admission data only and every scan goes through scan_admission. Headers: the proxy adds
// no-store, noindex and no-referrer for /door/*; the metadata repeats noindex + no-referrer.
export const metadata: Metadata = { title: "Door check-in · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DoorScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!UUID.test(eventId)) notFound();
  const ip = clientIp(new Request("http://local", { headers: await headers() }));
  if (!(await rateLimit(`door:ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`, 600, 3600))) throw new Error("Too many requests. Please try again shortly.");
  const { supabase, user } = await requireUser(`/door/${eventId}`);
  if (!(await rateLimit(`door:user:${user.id}`, 300, 3600))) throw new Error("Too many requests. Please try again shortly.");
  const db = untyped(supabase);
  const { data: allowed, error } = await db.rpc("can_scan_event_any", { p_event: eventId });
  if (error || allowed !== true) notFound();
  const { data: ev } = await untyped(createAdminClient() as never).from("events").select("id,name,status").eq("id", eventId).maybeSingle();
  if (!ev) notFound();
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "16px 16px 48px" }}>
    <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--k-muted, #6b7280)" }}>Door check-in · signed in as {user.email}</p>
    <TicketScanner eventId={eventId} eventName={String(ev.name ?? "Event")} />
    <p style={{ marginTop: 18, fontSize: 12, color: "var(--k-muted, #6b7280)" }}>Your check-in access for this event was given by the organiser and may be limited to some zones or end at a set time. Don&apos;t share your screen or this device&apos;s offline list.</p>
  </main>;
}
