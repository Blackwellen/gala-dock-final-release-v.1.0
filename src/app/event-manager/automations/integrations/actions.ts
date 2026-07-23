"use server";

import { randomBytes, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const BASE = "/event-manager/automations/integrations";

/**
 * Logs a real "demo delivery" row against a webhook. No outbound HTTP call is
 * actually made — there's no live third-party endpoint to call for the seeded
 * demo connections in this workspace. The row is genuinely written to
 * integration_webhook_deliveries so the UI (delivery table, health %, activity
 * counters) reflects real database state, not a faked network round-trip.
 */
export async function logTestDelivery(webhookId: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: webhook } = await supabase
    .from("integration_webhooks")
    .select("id, subscribed_events")
    .eq("id", webhookId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!webhook) return { ok: false, error: "Webhook not found" };

  const eventType = (webhook.subscribed_events as string[] | null)?.[0] ?? "test.webhook";

  const { data: inserted, error: insertError } = await supabase
    .from("integration_webhook_deliveries")
    .insert({
      workspace_id: workspaceId,
      webhook_id: webhookId,
      event_type: eventType,
      status: "pending",
      attempt: 1,
      payload: { demo: true, note: "Demo delivery logged from Integrations — no live endpoint was called." },
    })
    .select("id")
    .single();
  if (insertError || !inserted) return { ok: false, error: insertError?.message ?? "Could not log delivery" };

  const { error: updateError } = await supabase
    .from("integration_webhook_deliveries")
    .update({ status: "delivered", response_code: 200 })
    .eq("id", inserted.id);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(BASE);
  return { ok: true };
}

/** Re-logs the most recent delivery event for a webhook as a fresh demo delivery row. */
export async function redeliverLastEvent(webhookId: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("integration_webhook_deliveries")
    .select("event_type")
    .eq("workspace_id", workspaceId)
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { ok: false, error: "No previous delivery to redeliver" };

  const { data: inserted, error: insertError } = await supabase
    .from("integration_webhook_deliveries")
    .insert({
      workspace_id: workspaceId,
      webhook_id: webhookId,
      event_type: last.event_type,
      status: "pending",
      attempt: 1,
      payload: { demo: true, note: "Redelivery logged from Integrations — no live endpoint was called." },
    })
    .select("id")
    .single();
  if (insertError || !inserted) return { ok: false, error: insertError?.message ?? "Could not log redelivery" };

  const { error: updateError } = await supabase
    .from("integration_webhook_deliveries")
    .update({ status: "delivered", response_code: 200 })
    .eq("id", inserted.id);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(BASE);
  return { ok: true };
}

/** Retries a specific failed delivery by logging a new delivery row with an incremented attempt count. */
export async function retryFailedDelivery(deliveryId: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: original } = await supabase
    .from("integration_webhook_deliveries")
    .select("webhook_id, event_type, attempt")
    .eq("id", deliveryId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!original) return { ok: false, error: "Delivery not found" };

  const { data: inserted, error: insertError } = await supabase
    .from("integration_webhook_deliveries")
    .insert({
      workspace_id: workspaceId,
      webhook_id: original.webhook_id,
      event_type: original.event_type,
      status: "pending",
      attempt: (original.attempt ?? 1) + 1,
      payload: { demo: true, note: "Manual retry logged from Integrations — no live endpoint was called." },
    })
    .select("id")
    .single();
  if (insertError || !inserted) return { ok: false, error: insertError?.message ?? "Could not log retry" };

  const { error: updateError } = await supabase
    .from("integration_webhook_deliveries")
    .update({ status: "delivered", response_code: 200 })
    .eq("id", inserted.id);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(BASE);
  return { ok: true };
}

/**
 * Rotates a webhook's signing secret. This genuinely regenerates the secret
 * server-side and stores only its SHA-256 hash — the plaintext secret is
 * returned once in the action result so the UI can show a "copy it now, you
 * won't see it again" state, matching how real webhook secrets are handled.
 */
export async function rotateWebhookSecret(webhookId: string): Promise<{ ok: boolean; error?: string; secret?: string }> {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: webhook } = await supabase
    .from("integration_webhooks")
    .select("id")
    .eq("id", webhookId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!webhook) return { ok: false, error: "Webhook not found" };

  const secret = randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(secret).digest("hex");

  const { error } = await supabase.from("integration_webhooks").update({ secret_hash: hash }).eq("id", webhookId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE);
  return { ok: true, secret };
}

/** Appends a new event type to a webhook's subscribed_events list. */
export async function addSubscribedEvent(webhookId: string, eventType: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId } = await requireWorkspaceManager();
  const trimmed = eventType.trim();
  if (!trimmed) return { ok: false, error: "Event type cannot be empty" };
  const supabase = await createClient();

  const { data: webhook } = await supabase
    .from("integration_webhooks")
    .select("subscribed_events")
    .eq("id", webhookId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!webhook) return { ok: false, error: "Webhook not found" };

  const current = (webhook.subscribed_events as string[] | null) ?? [];
  if (current.includes(trimmed)) return { ok: true };

  const { error } = await supabase
    .from("integration_webhooks")
    .update({ subscribed_events: [...current, trimmed] })
    .eq("id", webhookId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE);
  return { ok: true };
}

/** Removes an event type from a webhook's subscribed_events list. */
export async function removeSubscribedEvent(webhookId: string, eventType: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: webhook } = await supabase
    .from("integration_webhooks")
    .select("subscribed_events")
    .eq("id", webhookId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!webhook) return { ok: false, error: "Webhook not found" };

  const current = (webhook.subscribed_events as string[] | null) ?? [];
  const { error } = await supabase
    .from("integration_webhooks")
    .update({ subscribed_events: current.filter((e) => e !== eventType) })
    .eq("id", webhookId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE);
  return { ok: true };
}

/**
 * Connects an api_key-type integration by writing a real integration_connections
 * row. Only the last 4 characters of the pasted key are ever stored or returned —
 * the full key is never persisted, logged or echoed back to the client.
 */
export async function connectApiKeyIntegration(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const trimmedKey = apiKey.trim();
  if (!provider.trim()) return { ok: false, error: "Provider is required" };
  if (trimmedKey.length < 6) return { ok: false, error: "API key looks too short" };
  const supabase = await createClient();

  const { error } = await supabase
    .from("integration_connections")
    .upsert(
      {
        workspace_id: workspaceId,
        provider: provider.trim(),
        connect_type: "api_key",
        status: "connected",
        secret_last4: trimmedKey.slice(-4),
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(BASE);
  return { ok: true };
}
