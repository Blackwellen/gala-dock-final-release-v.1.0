"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$/i;

/** Submits an uploaded file as a credential for review. RLS + has_permission enforce who may submit. */
export async function submitCredential(input: { workspaceId: string; credentialKey: string; filePath: string; fileName: string; expiresOn?: string; reference?: string; issuer?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  if (!PATH.test(input.filePath) || !input.filePath.startsWith(`${user.id}/`)) return { error: "Upload the document again." };
  if (!/^[a-z_]+$/.test(input.credentialKey)) return { error: "Unknown credential type." };
  if (input.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) || new Date(input.expiresOn) < new Date(new Date().toDateString()))) return { error: "Enter a future expiry date." };
  const { error } = await supabase.from("provider_documents" as never).insert({
    workspace_id: input.workspaceId, credential_key: input.credentialKey, file_path: input.filePath, file_name: input.fileName.slice(0, 120),
    expires_on: input.expiresOn || null, reference: input.reference?.slice(0, 80) || null, issuing_organisation: input.issuer?.slice(0, 120) || null, uploaded_by: user.id,
  } as never);
  if (error) return { error: error.code === "42501" ? "You don’t have permission to manage credentials." : "Could not submit the document. Please try again." };
  revalidatePath("/provider/settings");
  return { ok: true };
}
