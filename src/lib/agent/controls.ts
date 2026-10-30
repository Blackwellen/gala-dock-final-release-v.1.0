"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Settings → Agent controls (Q42/Q43): workspace kill switch (set_agent_kill_switch: owner/manager + fresh step-up + reason; pauses
 * in-flight runs) and user-visible memory reset (agent_memory_forget). Every call runs as the signed-in human; the database decides.
 */
type R = { ok: true; message?: string } | { ok: false; error: string };
const done = () => { revalidatePath("/organizer/settings", "page"); revalidatePath("/provider/settings", "page"); };
const why = (m: string) =>
  /step_up/.test(m) ? "Confirm it’s you first: verify with your authenticator (Security), then try again."
  : /reason_required/.test(m) ? "Give a short reason (at least 3 characters)."
  : /not_authorized/.test(m) ? "Only workspace owners and managers can change this."
  : "Couldn’t save. Try again.";

export async function setAgentKillSwitch(workspaceId: string, f: FormData): Promise<R> {
  const on = f.get("on") === "true";
  const reason = String(f.get("reason") ?? "").trim().slice(0, 300);
  const sb = await createClient();
  const { error } = await sb.rpc("set_agent_kill_switch" as never, { p_workspace: workspaceId, p_on: on, p_reason: reason } as never);
  if (error) return { ok: false, error: why(error.message) };
  done();
  return { ok: true, message: on ? "Gala Agent is switched off for this workspace. Running tasks were paused." : "Gala Agent is switched back on. Paused tasks can be resumed from their run page." };
}

export async function forgetAgentMemory(workspaceId: string, memoryId: string | null, scope: "user" | "workspace" | "all" | null): Promise<R> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("agent_memory_forget" as never, { p_workspace: workspaceId, p_memory: memoryId, p_scope: scope } as never);
  if (error) return { ok: false, error: why(error.message) };
  done();
  return { ok: true, message: `${Number(data ?? 0)} item${Number(data) === 1 ? "" : "s"} forgotten.` };
}
