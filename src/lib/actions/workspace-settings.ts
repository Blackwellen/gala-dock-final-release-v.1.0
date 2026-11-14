"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getOrganizer } from "@/lib/data/context";
import type { ActionResult } from "./shell";
import type { Json } from "@/types/database";
import { memberRoleError, removeMemberError, workspacePatchProblem, workspaceSettingsError } from "@/lib/settings/rules";
import { workspaceCoverUrlOk } from "@/lib/profiles/rules";

const Patch = z.record(z.string().max(40), z.unknown());
export async function saveWorkspaceSettings(patch: unknown): Promise<ActionResult> {
  const p = Patch.safeParse(patch); if (!p.success) return { ok: false, error: "Invalid settings." };
  // Q60: the database keeps the old name/cover silently when the new value is invalid; refuse instead of reporting "saved".
  const problem = workspacePatchProblem(p.data); if (problem) return { ok: false, error: problem };
  // Q62: the cover is uploaded (saveWorkspaceCover) so it is scanned; a typed URL hot-linked unscanned third-party images.
  if ("cover_image" in p.data) return { ok: false, error: "Upload the cover image with Change photo." };
  const ctx = await getOrganizer();
  const { error } = await ctx.supabase.rpc("update_workspace_settings", { p_ws: ctx.workspace.id, p: p.data as Json });
  if (error) return { ok: false, error: workspaceSettingsError(error.message) };
  revalidatePath("/organizer/settings"); revalidatePath("/organizer", "layout"); return { ok: true, message: "Settings saved." };
}
/** Q62: workspace cover from the files pipeline (/api/files/public-media) only; owners and managers (update_workspace_settings). */
export async function saveWorkspaceCover(url: string): Promise<ActionResult> {
  const ctx = await getOrganizer();
  if (!["owner", "manager"].includes(String(ctx.role))) return { ok: false, error: "Only owners and managers can change the cover image." };
  if (!workspaceCoverUrlOk(url, ctx.workspace.id)) return { ok: false, error: "Upload the image here — links to other sites can't be used." };
  const { error } = await ctx.supabase.rpc("update_workspace_settings", { p_ws: ctx.workspace.id, p: { cover_image: url } as Json });
  if (error) return { ok: false, error: workspaceSettingsError(error.message) };
  revalidatePath("/organizer/settings"); revalidatePath("/organizer", "layout"); return { ok: true, message: "Cover image updated." };
}
export async function changeMemberRole(userId: string, role: "manager" | "member" | "finance"): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Member not found." };
  if (!["manager", "member", "finance"].includes(role)) return { ok: false, error: "Choose a role." };
  const ctx = await getOrganizer();
  const { error } = await ctx.supabase.rpc("set_member_role", { p_ws: ctx.workspace.id, p_user: userId, p_role: role });
  if (error) return { ok: false, error: memberRoleError(error.message) };
  revalidatePath("/organizer/settings"); return { ok: true, message: "Role updated." };
}
/**
 * Owner removes a login member, or restores a removed one (revoke_workspace_member: owner only, the owner can't be changed, audited).
 * Restoring matters because respond_to_invite refuses invitations for anyone with a revoked membership, so re-inviting can't bring them back.
 */
export async function removeMember(userId: string, restore = false): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Member not found." };
  const ctx = await getOrganizer();
  if (ctx.role !== "owner") return { ok: false, error: "Only the workspace owner can remove members." };
  if (userId === ctx.user.id) return { ok: false, error: "The workspace owner can't be removed." };
  const { error } = await ctx.supabase.rpc("revoke_workspace_member", { p_ws: ctx.workspace.id, p_user: userId, p_status: restore ? "active" : "revoked", p_reason: restore ? "Restored in Settings" : "Removed in Settings" });
  if (error) return { ok: false, error: removeMemberError(error.message) };
  revalidatePath("/organizer/settings"); return { ok: true, message: restore ? "Access restored." : "Member removed. Their past activity stays in the audit log." };
}
