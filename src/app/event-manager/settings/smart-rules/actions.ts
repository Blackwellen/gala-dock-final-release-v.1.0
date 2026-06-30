"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Trigger = Database["public"]["Enums"]["smart_rule_trigger"];
type Action = Database["public"]["Enums"]["smart_rule_action"];

const TRIGGERS: Trigger[] = [
  "invoice_overdue",
  "quote_unread_after",
  "task_due_in",
  "event_stage_changed",
  "supplier_no_reply",
  "file_uploaded",
  "nightly_cron",
];
const ACTIONS: Action[] = ["send_email", "create_task", "notify_user", "set_tag", "webhook_internal_only"];

/** Create a smart rule. Installs DISABLED + dry-run (review-first) by design. */
export async function createSmartRule(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const trigger = String(formData.get("trigger") ?? "") as Trigger;
  const action = String(formData.get("action") ?? "") as Action;

  if (!name) return { ok: false, error: "Name is required" };
  if (!TRIGGERS.includes(trigger)) return { ok: false, error: "Invalid trigger" };
  if (!ACTIONS.includes(action)) return { ok: false, error: "Invalid action" };

  const { error } = await supabase.from("smart_rules").insert({
    workspace_id: workspaceId,
    name,
    trigger_kind: trigger,
    action_kind: action,
    created_by: user.id,
    owner_user_id: user.id,
    enabled: false, // review-first draft
    dry_run: true,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/event-manager/settings/smart-rules");
  return { ok: true };
}

/** Toggle a rule's enabled state. */
export async function toggleSmartRule(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("smart_rules").update({ enabled }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/event-manager/settings/smart-rules");
  return { ok: true };
}

/** Soft-delete a rule. */
export async function deleteSmartRule(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("smart_rules")
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/event-manager/settings/smart-rules");
  return { ok: true };
}
