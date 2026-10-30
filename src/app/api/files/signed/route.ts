import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { isOwnedKey } from "@/lib/files/policy";
import { gate } from "@/lib/files/service";

const missing = () => NextResponse.json({ error: "File not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * Q04 owner-scoped signed download for the caller's own private uploads (`workspace-files/<user>/…`). The key must be one the
 * server generates for this user (no traversal, no other owner's folder), the object must pass the quarantine gate, and the URL
 * lives 60 seconds. Context downloads (messages, requests, disputes, event files) keep their own routes, which use the same gate.
 */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await hasRequiredAssurance(supabase))) return NextResponse.json({ error: "Complete multi-factor authentication first" }, { status: 403 });
  if (!isOwnedKey(path, user.id)) return missing();
  const admin = createAdminClient();
  const blocked = await gate(admin, "workspace-files", path);
  if (blocked) return blocked;
  const { data, error } = await admin.storage.from("workspace-files").createSignedUrl(path, 60);
  if (error || !data) return missing();
  return NextResponse.json({ url: data.signedUrl, expiresIn: 60 }, { headers: { "Cache-Control": "private, no-store" } });
}
