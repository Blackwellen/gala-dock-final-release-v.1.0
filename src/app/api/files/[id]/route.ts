import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Secure download: RLS decides visibility of the media record; then a 60-second signed URL is issued. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: asset } = await supabase.from("media_assets").select("url,title").eq("id", id).maybeSingle();
  if (!asset?.url || asset.url.startsWith("/") || asset.url.startsWith("http")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await createAdminClient().storage.from("workspace-files").createSignedUrl(asset.url, 60, { download: asset.title });
  if (error || !data) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
