"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";

type R = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Undo a design delete (archiveDesign sets deleted_at). design_access hides deleted rows, so access is checked here directly:
 *  the owner or an owner/manager/member of the design's workspace, within 30 days of deletion. */
export async function restoreDesign(id: string): Promise<R> {
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const admin = untyped(createAdminClient() as never);
  const { data: d } = await admin.from("designs").select("owner_id,workspace_id,deleted_at").eq("id", id).maybeSingle();
  if (!d?.deleted_at) return { ok: false, error: "Not found." };
  if (Date.now() - Date.parse(d.deleted_at as string) > 30 * 864e5) return { ok: false, error: "This design was deleted more than 30 days ago." };
  let allowed = d.owner_id === user.id;
  if (!allowed && d.workspace_id) {
    const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", d.workspace_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    allowed = ["owner", "manager", "member"].includes((m?.role as string | undefined) ?? "");
  }
  if (!allowed) return { ok: false, error: "You can’t restore this design." };
  await admin.from("designs").update({ deleted_at: null }).eq("id", id);
  revalidatePath("/organizer/media", "page"); revalidatePath("/provider/media", "page");
  return { ok: true };
}
