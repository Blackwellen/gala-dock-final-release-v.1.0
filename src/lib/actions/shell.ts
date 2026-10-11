"use server";
import { z } from "zod";
import { requireUser, listWorkspaceAccess } from "@/lib/auth";

export type ActionResult<T = unknown> = { ok: boolean; error?: string; message?: string; data?: T; redirect?: string };

/** Switch the active workspace. Only workspaces the caller actively belongs to are accepted. */
export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(workspaceId);
  if (!id.success) return { ok: false, error: "Invalid workspace." };
  const { supabase } = await requireUser();
  const ws = (await listWorkspaceAccess(supabase)).find(w => w.id === id.data && w.member_status === "active" && w.workspace_status === "active");
  if (!ws) return { ok: false, error: "You don't have access to that workspace." };
  if (!ws.onboarding_complete) return { ok: true, redirect: `/onboarding/${ws.kind}?step=1` };
  await supabase.rpc("remember_workspace", { p_workspace: ws.id });
  return { ok: true, message: `Switched to ${ws.name}`, redirect: ws.kind === "organizer" ? "/organizer" : `/${ws.kind}` };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  return error ? { ok: false, error: "Could not update notifications." } : { ok: true };
}
