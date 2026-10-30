import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Q37 push delivery (domain 233). Status is BLOCKED_EXTERNAL until the owner creates VAPID keys and sets
 * WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY and WEB_PUSH_SUBJECT (mailto: or https: contact), and a Web Push
 * sender library is approved (none is installed; adding a dependency is a supply-chain decision for Q39).
 * Queued rows (push_outbox) are claimed with a lease and marked; 404/410 from the push service revokes the device.
 */
type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

export function pushConfig() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
  const configured = /^[A-Za-z0-9_-]{80,100}$/.test(publicKey) && !!process.env.WEB_PUSH_VAPID_PRIVATE_KEY && /^(mailto:|https:)/.test(process.env.WEB_PUSH_SUBJECT ?? "");
  return { configured, publicKey: configured ? publicKey : null, status: configured ? "READY_NO_SENDER" : "BLOCKED_EXTERNAL" } as const;
}

/** Sender entry point for the app worker. Without configuration it leaves the queue untouched and reports why. */
export async function deliverPendingPush(limit = 100) {
  const cfg = pushConfig();
  if (!cfg.configured) return { status: "BLOCKED_EXTERNAL" as const, reason: "VAPID keys are not configured", delivered: 0 };
  // Keys exist but no Web Push encryption library is installed yet: mark claimed rows so they are visible, then stop.
  const db = createAdminClient() as unknown as Rpc;
  const { data, error } = await db.rpc("push_claim", { p_limit: limit });
  if (error) throw new Error(`push_claim: ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  for (const r of rows) await db.rpc("push_mark", { p_id: r.id, p_status: "blocked_external", p_error: "web push sender library not installed" });
  return { status: "BLOCKED_EXTERNAL" as const, reason: "web push sender library not installed", delivered: 0, parked: rows.length };
}

export async function pushHealth() {
  const { data } = await (createAdminClient() as unknown as Rpc).rpc("push_health");
  return { ...pushConfig(), ...(data as Record<string, unknown> ?? {}) };
}
