"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceMemberRole } from "@/lib/supabase/types";

const VALID_ROLES: WorkspaceMemberRole[] = ["owner", "admin", "manager", "member"];

function coerceRole(raw: FormDataEntryValue | null): WorkspaceMemberRole | null {
  const value = String(raw ?? "");
  return (VALID_ROLES as string[]).includes(value) ? (value as WorkspaceMemberRole) : null;
}

/** Update a member's role within the active workspace. Owner role is not assignable here. */
export async function updateMemberRole(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const memberId = String(formData.get("member_id") ?? "");
  const role = coerceRole(formData.get("role"));
  if (!memberId || !role || role === "owner") {
    return { ok: false, error: "Invalid role." };
  }

  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/event-manager/settings/team");
  return { ok: true };
}

/** Soft-remove a member from the active workspace. */
export async function removeMember(formData: FormData) {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return { ok: false, error: "Missing member." };

  const { error } = await supabase
    .from("workspace_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .neq("role", "owner")
    .is("deleted_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/event-manager/settings/team");
  return { ok: true };
}
