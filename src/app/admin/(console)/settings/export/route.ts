import { getAdmin } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";

/** JSON export of the live platform configuration (published version of every section). */
export async function GET() {
  const ctx = await getAdmin();
  if (!ctx.permissions.has("settings")) return new Response("Forbidden", { status: 403 });
  const list = await rows<{ section: string; version: number; release: string | null; value: unknown; effective_at: string }>(ctx.db.from("platform_settings").select("section,version,release,value,effective_at").eq("status", "published").order("section"));
  const body = JSON.stringify({ exported_at: new Date().toISOString(), sections: Object.fromEntries(list.map(r => [r.section, { version: r.version, release: r.release, effective_at: r.effective_at, value: r.value }])) }, null, 2);
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="gala-dock-configuration.json"', "Cache-Control": "private, no-store" } });
}
