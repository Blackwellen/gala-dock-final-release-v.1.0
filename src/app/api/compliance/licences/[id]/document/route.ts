import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { gate } from "@/lib/files/service";

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * Event licence document download (Q59). licence_document_access() authorises the signed-in user (anyone who can access the event);
 * the files gate refuses quarantined/infected files (licence documents are `sensitive`, so they fail closed until scanned clean);
 * then a 60-second signed URL is issued for that one object and the access is audited.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Not found" }, 404);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  const { data, error } = await untyped(supabase).rpc("licence_document_access", { p_licence: id });
  const doc = data as { path: string; file_name: string; workspace_id: string | null; event_id: string } | null;
  if (error || !doc?.path) return json({ error: "Not found" }, 404);
  const admin = createAdminClient();
  const blocked = await gate(admin, "workspace-files", doc.path); if (blocked) return blocked;
  const signed = await admin.storage.from("workspace-files").createSignedUrl(doc.path, 60, { download: doc.file_name || "licence" });
  if (signed.error || !signed.data) return json({ error: "File unavailable" }, 404);
  await untyped(admin).from("audit_events").insert({ actor_id: user.id, actor_type: "user", workspace_id: doc.workspace_id, event: "compliance.licence_document_accessed", metadata: { licence_id: id, event_id: doc.event_id } });
  return NextResponse.redirect(signed.data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
