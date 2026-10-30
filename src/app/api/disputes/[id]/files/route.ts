import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/files/service";

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$/i;

/**
 * Dispute evidence download. RLS on booking_dispute_entries decides who may see the entry (both parties and authorised admins;
 * internal notes excluded for parties); the file must be attached to a visible entry of this dispute. Then a 60-second signed URL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !PATH.test(path)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: entries } = await supabase.from("booking_dispute_entries" as never).select("files").eq("dispute_id", id).contains("files", [{ path }] as never).limit(1);
  const file = ((entries ?? []) as { files: { path: string; name: string }[] }[])[0]?.files.find(f => f.path === path);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocked = await gate(createAdminClient(), "workspace-files", path); if (blocked) return blocked;   // Q04 quarantine gate (evidence = sensitive)
  const { data, error } = await createAdminClient().storage.from("workspace-files").createSignedUrl(path, 60, { download: file.name.replace(/[^\w .()-]/g, "_") });
  if (error || !data) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
