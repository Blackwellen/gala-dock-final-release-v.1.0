import "server-only";
import { requireUser } from "@/lib/auth";
import { untyped, rows, one } from "@/lib/workspace/db";

export type Partner = { id: string; name: string; kind: string; status: string; referral_code: string | null; commission_bps: number; commission_basis: string; quality_score: number | null; grade: number; rate_locked: boolean };

/** Partner Terms 2: grade by active referred accounts → commission rate. */
export const GRADES = [{ grade: 1, from: 0, pct: 6 }, { grade: 2, from: 5, pct: 7 }, { grade: 3, from: 15, pct: 8 }, { grade: 4, from: 30, pct: 9 }, { grade: 5, from: 50, pct: 10 }];
export type Referral = { id: string; name: string; kind: "organiser" | "venue" | "supplier"; status: "pending" | "trial" | "active" | "churned"; signed_up_at: string; activated_at: string | null };
export type Earning = { occurred_at: string; eligible_revenue: number; commission: number; status: "pending" | "cleared" | "paid" | "reversed" };
export type Statement = { id: string; period_start: string; eligible_revenue: number; commission: number; status: "open" | "pending" | "paid" | "on_hold"; payout_due: string | null; paid_at: string | null; reference: string | null };
export type Content = { id: string; title: string; kind: string; image: string; clicks: number; signups: number };

/** Partner data through the signed-in user's RLS client: partners_read and *_read policies only return the caller's own rows. */
export async function loadPartner() {
  const { supabase, user } = await requireUser("/partner");
  const sb = untyped(supabase);
  const [partner, profile] = await Promise.all([
    one<Partner>(sb.from("partners").select("id,name,kind,status,referral_code,commission_bps,commission_basis,quality_score,grade,rate_locked").eq("user_id", user.id).neq("status", "terminated").limit(1).maybeSingle()),
    one<{ full_name: string | null; avatar_url: string | null }>(sb.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle()),
  ]);
  const me = { name: profile?.full_name || (user.user_metadata?.full_name as string | undefined) || user.email || "Partner", email: user.email ?? "", avatar: profile?.avatar_url ?? null };
  if (!partner) return { me, partner: null } as const;
  const since = new Date(Date.now() - 200 * 864e5).toISOString();
  const [referrals, earnings, statements, content] = await Promise.all([
    rows<Referral>(sb.from("partner_referrals").select("id,name,kind,status,signed_up_at,activated_at").eq("partner_id", partner.id).order("signed_up_at", { ascending: false }).limit(1000)),
    rows<Earning>(sb.from("partner_earnings").select("occurred_at,eligible_revenue,commission,status").eq("partner_id", partner.id).gte("occurred_at", since).order("occurred_at").limit(2000)),
    rows<Statement>(sb.from("partner_statements").select("id,period_start,eligible_revenue,commission,status,payout_due,paid_at,reference").eq("partner_id", partner.id).order("period_start", { ascending: false })),
    rows<Content>(sb.from("partner_content").select("id,title,kind,image,clicks,signups").eq("partner_id", partner.id)),
  ]);
  return { me, partner, referrals, earnings, statements, content } as const;
}

/** Downloadable partner resources (served by /partner/resources/[slug]). */
export const RESOURCES = [
  { slug: "brand-guidelines", title: "Brand Guidelines", text: "Logos, colours and usage", tone: "blue" },
  { slug: "banner-assets", title: "Banner Assets", text: "Web banners and social images", tone: "purple" },
  { slug: "partner-guide", title: "Partner Guide", text: "How to promote Gala Dock", tone: "pink" },
  { slug: "embed-widgets", title: "Embed Widgets", text: "Search and event widgets", tone: "amber" },
  { slug: "email-templates", title: "Email Templates", text: "Ready-to-use copy", tone: "blue" },
] as const;
