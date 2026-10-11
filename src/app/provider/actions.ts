"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceAccess } from "@/lib/auth";
import { PROVIDER_WS_COOKIE } from "@/lib/provider/context";
import type { ActionResult } from "@/lib/workspace/rpc";

/** Switches the active Provider workspace after confirming the caller holds an active membership in it. */
export async function switchProviderWorkspace(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await listWorkspaceAccess(supabase);
  const target = access.find(w => w.id === id && w.kind === "provider" && w.member_status === "active" && w.workspace_status === "active" && w.onboarding_complete);
  if (!target) return { ok: false, error: "You don’t have access to that workspace." };
  (await cookies()).set(PROVIDER_WS_COOKIE, target.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/provider", maxAge: 60 * 60 * 24 * 180 });
  await supabase.rpc("remember_workspace", { p_workspace: target.id });
  return { ok: true, message: `Switched to ${target.name}`, redirect: "/provider" };
}
