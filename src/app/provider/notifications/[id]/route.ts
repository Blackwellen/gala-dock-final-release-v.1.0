import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listWorkspaceAccess } from "@/lib/auth";
import { PROVIDER_WS_COOKIE } from "@/lib/provider/context";

// Q05/W04 (W13 follow-up): notifications have no workspace, but the bell lists every workspace's. Opening one now resolves which
// workspace its target belongs to, switches there first (when the caller is an active member), and sends a deleted target to its
// section list instead of a 404. Reads the target with the service role only to learn its workspace; access still comes from RLS.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SECTION: Record<string, string> = { beo: "/provider/bookings", bookings: "/provider/bookings", opportunities: "/provider/opportunities", quotes: "/provider/opportunities",
  emergency: "/provider/emergency", messages: "/provider/inbox", disputes: "/provider/bookings", packages: "/provider/listings/packages", services: "/provider/listings/services", venues: "/provider/listings/venues" };

async function targetWorkspaces(kind: string, id: string): Promise<string[] | null> {
  const db = createAdminClient() as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>; limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }> } } } };
  const one = async (t: string, c: string) => (await db.from(t).select(c).eq("id", id).maybeSingle()).data;
  const listingWs = async (listing: unknown) => listing ? ((await db.from("listings").select("workspace_id").eq("id", String(listing)).maybeSingle()).data?.workspace_id as string | undefined) : undefined;
  switch (kind) {
    case "beo": { const o = await one("event_orders", "workspace_id"); if (o) return [String(o.workspace_id)]; const j = await one("provider_jobs", "workspace_id"); return j ? [String(j.workspace_id)] : null; }
    case "bookings": { const j = await one("provider_jobs", "workspace_id"); return j ? [String(j.workspace_id)] : null; }
    case "quotes": { const q = await one("provider_quotes", "workspace_id"); return q ? [String(q.workspace_id)] : null; }
    case "opportunities": { const b = await one("build_items", "listing_id"); if (!b) return null; const w = await listingWs(b.listing_id); return w ? [w] : []; }
    case "messages": { const t = await one("threads", "listing_id"); if (!t) return null; const w = await listingWs(t.listing_id); return w ? [w] : []; }
    case "emergency": { const r = await one("emergency_requests", "id"); if (!r) return null; const c = (await db.from("emergency_candidates").select("workspace_id").eq("request_id", id).limit(50)).data ?? []; return c.map(x => String(x.workspace_id)); }
    case "packages": { const p = await one("packages", "workspace_id"); return p ? [String(p.workspace_id)] : null; }
    case "services": case "venues": { const l = await one("listings", "workspace_id"); return l ? [String(l.workspace_id)] : null; }
    default: return [];
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const home = new URL("/provider", req.url);
  if (!new RegExp(`^${UUID}$`, "i").test(id)) return NextResponse.redirect(home);
  const supabase = await createClient();
  const { data: n } = await supabase.from("notifications").select("id,link,read_at").eq("id", id).maybeSingle(); // RLS: own notifications only
  if (!n) return NextResponse.redirect(home);
  if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  const link = n.link || "/provider";
  if (!link.startsWith("/") || link.startsWith("//")) return NextResponse.redirect(home);
  const m = link.match(new RegExp(`^/provider/(beo|bookings|opportunities|quotes|emergency|messages|disputes|packages|services|venues)/(${UUID})`, "i"));
  if (!m) return NextResponse.redirect(new URL(link, req.url));
  const [, kind, target] = m as unknown as [string, string, string];
  const owners = await targetWorkspaces(kind.toLowerCase(), target.toLowerCase());
  if (owners === null) return NextResponse.redirect(new URL(`${SECTION[kind.toLowerCase()] ?? "/provider"}?gone=1`, req.url)); // target deleted
  const access = (await listWorkspaceAccess(supabase)).filter(w => w.kind === "provider" && w.member_status === "active" && w.workspace_status === "active" && w.onboarding_complete);
  const current = req.cookies.get(PROVIDER_WS_COOKIE)?.value;
  const res = NextResponse.redirect(new URL(link, req.url));
  const to = owners.includes(current ?? "") ? null : access.find(w => owners.includes(w.id));
  if (to) {
    res.cookies.set(PROVIDER_WS_COOKIE, to.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/provider", maxAge: 60 * 60 * 24 * 180 });
    await supabase.rpc("remember_workspace", { p_workspace: to.id });
  }
  return res;
}
