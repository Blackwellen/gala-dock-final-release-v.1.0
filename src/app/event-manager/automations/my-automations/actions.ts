"use server";

// Bulk row-selection actions for the My Automations table. Kept separate from the shared
// ../actions.ts (single-record pause/activate/archive/duplicate) so this file can be
// edited independently without touching code other agents are relying on.

import { revalidatePath } from "next/cache";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const BASE = "/event-manager/automations/my-automations";

export async function bulkPauseAutomations(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (ids.length === 0) return { ok: true };
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("smart_rules").update({ status: "paused", enabled: false }).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath(BASE);
  revalidatePath("/event-manager/automations");
  return { ok: true };
}

export async function bulkActivateAutomations(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (ids.length === 0) return { ok: true };
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase.from("smart_rules").update({ status: "active", enabled: true }).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath(BASE);
  revalidatePath("/event-manager/automations");
  return { ok: true };
}

export async function bulkArchiveAutomations(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (ids.length === 0) return { ok: true };
  await requireWorkspaceManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("smart_rules")
    .update({ status: "archived", enabled: false, archived_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath(BASE);
  revalidatePath("/event-manager/automations");
  return { ok: true };
}
