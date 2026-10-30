import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { gate } from "@/lib/files/service";

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Provider compliance document download (Q08). Source documents are `sensitive`: never public, never readable by another tenant.
 * provider_document_access() authorises the caller (Trust & Safety reviewer, or the owning workspace's settings/listings managers)
 * as the signed-in user; the Q04 gate refuses quarantined/infected files; only then a 60-second signed URL is issued for that one object.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Not found" }, 404);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  const { data, error } = await untyped(supabase).rpc("provider_document_access", { p_document: id });
  const doc = data as { bucket: string; path: string; file_name: string } | null;
  if (error || !doc?.path) return json({ error: "Not found" }, 404);
  const admin = createAdminClient();
  const blocked = await gate(admin, "workspace-files", doc.path); if (blocked) return blocked;
  const signed = await admin.storage.from("workspace-files").createSignedUrl(doc.path, 60, { download: doc.file_name || "document" });
  if (signed.error || !signed.data) return json({ error: "File unavailable" }, 404);
  await untyped(admin).from("audit_events").insert({ actor_id: user.id, actor_type: "user", event: "trust.document_accessed", metadata: { document_id: id } });
  return NextResponse.redirect(signed.data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
