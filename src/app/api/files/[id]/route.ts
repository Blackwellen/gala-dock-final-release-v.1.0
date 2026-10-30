import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/workspace/db";
import { gate } from "@/lib/files/service";

/** Secure download: RLS decides visibility of the media record; then a 60-second signed URL is issued. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db=untyped(supabase);
  const { data: asset } = await db.from("media_assets").select("url,title,event_id,storage_object_id,source_verified").eq("id", id).maybeSingle();
  if (!asset?.url || asset.url.startsWith("/") || asset.url.startsWith("http")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parts=asset.url.split('/');
  const legacyEventScope=parts.length===4&&parts[1]==='events'&&parts[2]===asset.event_id;
  if(!asset.source_verified&&parts[0]!==user.id&&!legacyEventScope)return NextResponse.json({error:"Not found"},{status:404});
  const matched=await db.rpc("event_file_object_matches",{p_asset:id});
  if(matched.error||matched.data!==true)return NextResponse.json({error:"Not found"},{status:404});
  const blocked = await gate(createAdminClient(), "workspace-files", asset.url); if (blocked) return blocked;   // Q04 quarantine gate
  const { data, error } = await createAdminClient().storage.from("workspace-files").createSignedUrl(asset.url, 60, { download: asset.title });
  if (error || !data) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
