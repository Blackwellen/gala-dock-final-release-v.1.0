import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/files/service";

/** Private design asset delivery (§10): access check in the DB, then a 5-minute signed URL. Originals never become public. */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: ok } = await sb.rpc("can_read_media_path" as never, { p_path: path } as never);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const blocked = await gate(createAdminClient(), "workspace-files", path); if (blocked) return blocked;   // Q04 quarantine gate
  const { data } = await createAdminClient().storage.from("workspace-files").createSignedUrl(path, 300);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=240" } });
}
