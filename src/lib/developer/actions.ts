"use server";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ALL_SCOPES } from "./gateway";
import { assertPublicUrl } from "./ssrf";
import { WEBHOOK_EVENTS } from "./webhook-catalogue";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const rand = (n: number) => Array.from({ length: n }, () => B62[randomInt(62)]).join("");
// Subscribable types come from the public webhook catalogue (Q30; mirrors public.webhook_payload_fields).
export async function webhookEvents(): Promise<string[]> { return [...WEBHOOK_EVENTS]; }
const bump = () => { revalidatePath("/organizer/settings", "page"); revalidatePath("/provider/settings", "page"); };

/** Creates a scoped key. The full key is returned once and only its SHA-256 hash is stored. */
export async function createApiKey(workspaceId: string, name: string, scopes: string[], expiresDays: number | null): Promise<R<string>> {
  const clean = scopes.filter(s => ALL_SCOPES.includes(s));
  if (!clean.length) return { ok: false, error: "Choose at least one scope." };
  if (name.trim().length < 2) return { ok: false, error: "Give the key a name." };
  const prefix = rand(8), key = `gd_live_${prefix}_${rand(32)}`;
  const sb = await createClient();
  const { error } = await sb.rpc("create_api_key" as never, { p_workspace: workspaceId, p_name: name, p_scopes: clean, p_prefix: prefix, p_hash: createHash("sha256").update(key).digest("hex"),
    p_expires: expiresDays ? new Date(Date.now() + Math.min(expiresDays, 365) * 864e5).toISOString() : null } as never);
  if (error) return { ok: false, error: /plan_required/.test(error.message) ? "API access is included from the Pro plan. Upgrade in Settings → Payments & Billing." : /not_authorized/.test(error.message) ? "Only owners and managers can create API keys." : "Couldn’t create the key." };
  bump(); return { ok: true, data: key };
}
export async function revokeApiKey(id: string): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("revoke_api_key" as never, { p_key: id } as never);
  if (error) return { ok: false, error: "Couldn’t revoke the key." };
  bump(); return { ok: true };
}

/** Adds an endpoint after checking it's a public https URL. The signing secret is returned once. */
export async function createWebhook(workspaceId: string, url: string, events: string[], description: string): Promise<R<string>> {
  const evs = events.filter(e => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (!evs.length) return { ok: false, error: "Choose at least one event." };
  let safe: string;
  try { safe = await assertPublicUrl(url.trim()); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const sb = await createClient();
  const { error } = await sb.rpc("create_webhook_endpoint" as never, { p_workspace: workspaceId, p_url: safe, p_events: evs, p_description: description, p_secret: secret } as never);
  if (error) return { ok: false, error: /limit_reached/.test(error.message) ? "A workspace can have up to 10 endpoints." : /not_authorized/.test(error.message) ? "Only owners and managers can add webhooks." : "Couldn’t add the endpoint." };
  bump(); return { ok: true, data: secret };
}
export async function setWebhookStatus(id: string, status: "active" | "disabled" | "deleted"): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("set_webhook_endpoint_status" as never, { p_endpoint: id, p_status: status } as never);
  if (error) return { ok: false, error: "Couldn’t update the endpoint." };
  bump(); return { ok: true };
}
export async function testWebhook(id: string): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("test_webhook_endpoint" as never, { p_endpoint: id } as never);
  return error ? { ok: false, error: "Couldn’t queue a test delivery." } : { ok: true };
}
export async function replayDelivery(id: string): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("replay_webhook_delivery" as never, { p_delivery: id } as never);
  if (error) return { ok: false, error: "Couldn’t replay." };
  bump(); return { ok: true };
}

/** Rotates a key: a new key with the same name, scopes and limits (acting as you); the old one keeps working for the grace window. */
export async function rotateApiKey(id: string, graceHours = 24): Promise<R<string>> {
  const prefix = rand(8), key = `gd_live_${prefix}_${rand(32)}`;
  const sb = await createClient();
  const { error } = await sb.rpc("rotate_api_key" as never, { p_key: id, p_prefix: prefix, p_hash: createHash("sha256").update(key).digest("hex"), p_grace_hours: Math.max(0, Math.min(168, Math.round(graceHours))) } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "Only owners and managers can rotate API keys." : /key_inactive/.test(error.message) ? "This key is already revoked or expired." : /step_up|mfa|session/.test(error.message) ? "Verify your second factor, then try again." : "Couldn’t rotate the key." };
  bump(); return { ok: true, data: key };
}
export async function setApiKeyLimits(id: string, ratePerMinute: number | null, expiresDays: number | null): Promise<R> {
  const sb = await createClient();
  const { error } = await sb.rpc("set_api_key_limits" as never, { p_key: id, p_rate_limit: ratePerMinute, p_expires: expiresDays ? new Date(Date.now() + Math.min(expiresDays, 365) * 864e5).toISOString() : null } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "Only owners and managers can change API keys." : /rate_limit/.test(error.message) ? "Rate limit must be 1–1200 requests a minute." : "Couldn’t update the key." };
  bump(); return { ok: true };
}
/** New signing secret (returned once). The previous secret also signs deliveries for 24 hours. */
export async function rotateWebhookSecret(id: string): Promise<R<string>> {
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const sb = await createClient();
  const { error } = await sb.rpc("rotate_webhook_secret" as never, { p_endpoint: id, p_secret: secret } as never);
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "Only owners and managers can rotate secrets." : "Couldn’t rotate the secret." };
  bump(); return { ok: true, data: secret };
}
