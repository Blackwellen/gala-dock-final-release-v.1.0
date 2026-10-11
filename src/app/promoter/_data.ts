import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { untyped, rows, one, isUuid } from "@/lib/workspace/db";

export type Promoter = { id: string; event_id: string; name: string; code: string; commission_pct: number; clicks: number; tickets_sold: number; revenue: number; status: string; payout_method: string | null };
export type PromoEvent = { id: string; name: string; slug: string | null; status: string; visibility: string; starts_at: string | null; ends_at: string | null; venue_name: string; city: string; location: string;
  tags: string[]; cover_image: string; description: string; settings: { hero_image?: string; video_url?: string } | null };
export type Sale = { id: string; tier_name: string; quantity: number; amount: number; commission: number; status: "pending" | "approved" | "paid" | "reversed"; channel: string; asset_id: string | null; sold_at: string };
export type Payout = { id: string; amount: number; status: string; scheduled_for: string; paid_at: string | null; reference: string | null };
export type Asset = { id: string; title: string; kind: string; image: string; url: string; caption: string };
export type ClickStat = { day: string; channel: string; asset_id: string | null; clicks: number };
export type Tier = { name: string; release_name: string; sale_start: string | null; status: string };

/** Loads one promoter's campaign through the signed-in user's RLS client (a promoter only ever sees their own rows). */
export async function loadPromoter(promoterId?: string) {
  const path = promoterId ? `/promoter/${promoterId}` : "/promoter";
  const { supabase, user } = await requireUser(path);
  const sb = untyped(supabase);
  const mine = await rows<Promoter>(sb.from("promoters").select("id,event_id,name,code,commission_pct,clicks,tickets_sold,revenue,status,payout_method").eq("user_id", user.id));
  if (promoterId && (!isUuid(promoterId) || !mine.some(p => p.id === promoterId))) notFound();
  const events = mine.length ? await rows<PromoEvent>(sb.from("events").select("id,name,slug,status,visibility,starts_at,ends_at,venue_name,city,location,tags,cover_image,description,settings").in("id", mine.map(p => p.event_id))) : [];
  const profile = await one<{ full_name: string | null; avatar_url: string | null }>(sb.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle());
  const me = { name: profile?.full_name || (user.user_metadata?.full_name as string | undefined) || user.email || "Promoter", email: user.email ?? "", avatar: profile?.avatar_url ?? null };
  // Default campaign: active promoter on the soonest upcoming event.
  const ranked = [...mine].sort((a, b) => {
    const ea = events.find(e => e.id === a.event_id), eb = events.find(e => e.id === b.event_id);
    return Number(a.status !== "active") - Number(b.status !== "active") || Date.parse(ea?.starts_at ?? "9999") - Date.parse(eb?.starts_at ?? "9999");
  });
  const promoter = promoterId ? mine.find(p => p.id === promoterId)! : ranked[0];
  if (!promoter) return { me, campaigns: [] as { promoter: Promoter; event: PromoEvent | undefined }[], current: null };
  const event = events.find(e => e.id === promoter.event_id);
  if (!event) notFound();
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const [sales, payouts, assets, clicks, tiers, board] = await Promise.all([
    rows<Sale>(sb.from("promoter_sales").select("id,tier_name,quantity,amount,commission,status,channel,asset_id,sold_at").eq("promoter_id", promoter.id).order("sold_at", { ascending: false }).limit(1000)),
    rows<Payout>(sb.from("promoter_payouts").select("id,amount,status,scheduled_for,paid_at,reference").eq("promoter_id", promoter.id).order("scheduled_for", { ascending: false })),
    rows<Asset>(sb.from("promoter_assets").select("id,title,kind,image,url,caption").eq("event_id", event.id).order("sort")),
    rows<ClickStat>(sb.rpc("promoter_click_stats", { p_promoter: promoter.id, p_since: since })),
    rows<Tier>(sb.from("ticket_tiers").select("name,release_name,sale_start,status").eq("event_id", event.id).order("sale_start")),
    rows<{ rank: number; name: string; tickets_sold: number; is_you: boolean }>(sb.rpc("promoter_leaderboard", { p_promoter: promoter.id })),
  ]);
  return { me, campaigns: ranked.map(p => ({ promoter: p, event: events.find(e => e.id === p.event_id) })), current: { promoter, event, sales, payouts, assets, clicks: clicks.map(c => ({ ...c, clicks: Number(c.clicks) })), tiers, board } };
}
export type PromoterData = Awaited<ReturnType<typeof loadPromoter>>;
