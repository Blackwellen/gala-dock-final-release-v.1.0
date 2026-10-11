"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";

const Patch = z.record(z.string().max(40), z.unknown());
export async function saveWorkspaceSettings(patch: unknown): Promise<ActionResult> {
  const p = Patch.safeParse(patch); if (!p.success) return { ok: false, error: "Invalid settings." };
  const ctx = await getOrganizer();
  const { error } = await ctx.supabase.rpc("update_workspace_settings", { p_ws: ctx.workspace.id, p: p.data as Json });
  if (error) return { ok: false, error: error.message.includes("not_authorized") ? "Only owners and managers can change workspace settings." : error.message.includes("invalid_email") ? "Enter a valid contact email." : "Could not save settings." };
  revalidatePath("/organizer/settings"); revalidatePath("/organizer", "layout"); return { ok: true, message: "Settings saved." };
}
export async function changeMemberRole(userId: string, role: "manager" | "member" | "finance"): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Member not found." };
  const ctx = await getOrganizer();
  const { error } = await ctx.supabase.rpc("set_member_role", { p_ws: ctx.workspace.id, p_user: userId, p_role: role });
  if (error) return { ok: false, error: error.message.includes("owner_locked") ? "The owner's role can't be changed." : error.message.includes("not_authorized") ? "Only the workspace owner can change roles." : "Could not change the role." };
  revalidatePath("/organizer/settings"); return { ok: true, message: "Role updated." };
}
