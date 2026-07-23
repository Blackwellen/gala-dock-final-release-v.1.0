"use server";

import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

/** Get a short-lived signed download/preview URL for a job (task) evidence attachment. */
export async function getJobEvidenceDownloadUrl(
  attachmentId: string
): Promise<{ url: string } | { error: string }> {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: attachment } = await supabase
    .from("task_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!attachment?.storage_path) return { error: "This attachment could not be found." };

  const { r2Configured, r2PresignedGet } = await import("@/lib/storage/r2");
  if (!r2Configured()) return { error: "Storage is not configured." };
  try {
    const url = await r2PresignedGet({ key: attachment.storage_path });
    return { url };
  } catch {
    return { error: "Could not generate a download link." };
  }
}
