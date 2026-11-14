import type { Metadata } from "next";
import Link from "next/link";
import { Star, MessageSquareText, ShieldAlert, BadgeCheck } from "lucide-react";
import "@/styles/provider-team.css";
import { getProvider } from "@/lib/provider/context";
import { workspaceListings } from "@/lib/provider/queries";
import { rows } from "@/lib/workspace/db";
import { Chip, Empty } from "@/components/workspace/kit";
import { ActionForm } from "@/components/workspace/actions";
import { REPLY_MAX } from "@/lib/profiles/rules";
import { replyToReview } from "./actions";

export const metadata: Metadata = { title: "Reviews" };

type Rev = { id: string; listing_id: string; rating: number; body: string; created_at: string; build_item_id: string | null; provider_response: string | null;
  responded_at: string | null; response_updated_at: string | null; response_status: string | null; response_moderation_reason: string | null };
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "";

/**
 * Q62 / Q49: provider review replies. Published reviews of this workspace's listings (reviews_provider_read); owners and managers
 * write ONE public reply per review and can edit it (respond_to_review). Replies show under the review on the public listing page;
 * the reviewer is notified on the first reply. A reply Gala Dock removed (moderate_review_response) can't be re-posted here.
 */
export default async function ProviderReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [ctx, listings] = await Promise.all([getProvider(), workspaceListings()]);
  const tab = sp.tab === "all" ? "all" : "unanswered";
  const byId = new Map(listings.map(l => [l.id, l]));
  const revs = listings.length ? await rows<Rev>(ctx.db.from("reviews")
    .select("id,listing_id,rating,body,created_at,build_item_id,provider_response,responded_at,response_updated_at,response_status,response_moderation_reason")
    .in("listing_id", listings.map(l => l.id)).eq("status", "published").order("created_at", { ascending: false }).limit(200)) : [];
  const unanswered = revs.filter(r => !r.provider_response && r.response_status !== "hidden");
  const shown = tab === "all" ? revs : unanswered;
  const avg = revs.length ? revs.reduce((a, r) => a + r.rating, 0) / revs.length : null;
  const stars = (n: number) => <span role="img" aria-label={`${n} out of 5 stars`} style={{ color: "#f59e0b", letterSpacing: 1 }}>{"★".repeat(n)}<span style={{ color: "#d0d5dd" }}>{"★".repeat(5 - n)}</span></span>;

  return <div className="pr">
    <header className="ws-page-head"><div><h1>Reviews</h1><p>Reply to what customers say about your listings. Replies are public and appear under the review.</p></div></header>
    <nav className="ws-tabs underline" aria-label="Review filters">{([["unanswered", `Needs a reply (${unanswered.length})`], ["all", `All reviews (${revs.length})`]] as const).map(([k, l]) =>
      <Link key={k} href={k === "unanswered" ? "/provider/reviews" : "/provider/reviews?tab=all"} className={tab === k ? "active" : ""} aria-current={tab === k ? "page" : undefined}>{l}</Link>)}</nav>
    {avg != null && <p className="ws-muted" style={{ margin: "12px 0" }}>{revs.length} published review{revs.length === 1 ? "" : "s"} · average {avg.toFixed(1)} / 5</p>}
    {!ctx.can.manage && <p className="ws-muted" role="note">Only the workspace owner or a manager can reply to reviews.</p>}
    {shown.length ? <ul style={{ display: "grid", gap: 14, listStyle: "none", padding: 0, marginTop: 14 }}>{shown.map(r => { const l = byId.get(r.listing_id); const href = l?.slug && l.published ? `/${l.kind === "venue" ? "venues" : "services"}/${l.slug}#reviews` : null;
      return <li key={r.id} className="ws-panel" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div><h2 style={{ fontSize: 15, margin: 0 }}>{href ? <Link href={href}>{l?.name ?? "Listing"}</Link> : (l?.name ?? "Listing")}</h2>
            <p style={{ margin: "4px 0 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{stars(r.rating)}<small>{day(r.created_at)}</small>{r.build_item_id && <Chip tone="green"><BadgeCheck aria-hidden="true" />Verified booking</Chip>}</p></div>
          {r.response_status === "hidden" ? <Chip tone="red">Reply removed</Chip> : r.provider_response ? <Chip tone="blue">Replied</Chip> : <Chip tone="orange">Needs a reply</Chip>}</div>
        <p style={{ margin: "10px 0 0", whiteSpace: "pre-line" }}>{r.body}</p>
        {r.response_status === "hidden" ? <p role="note" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#fef3f2", color: "#912018" }}><ShieldAlert size={14} aria-hidden="true" /> Gala Dock removed your reply{r.response_moderation_reason ? `: ${r.response_moderation_reason}` : "."} Contact support if you think that was a mistake.</p>
          : ctx.can.manage ? <ActionForm action={replyToReview.bind(null, r.id)} className="pt-form">
              <label style={{ display: "grid", gap: 6, marginTop: 12 }}><span>{r.provider_response ? "Your public reply" : "Write a public reply"}</span>
                <textarea name="body" rows={3} required minLength={2} maxLength={REPLY_MAX} defaultValue={r.provider_response ?? ""} placeholder="Thank the customer, address any concerns and keep it professional." /></label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <small className="ws-muted">{r.provider_response ? `Replied ${day(r.responded_at)}${r.response_updated_at && r.response_updated_at !== r.responded_at ? ` · edited ${day(r.response_updated_at)}` : ""}` : "One reply per review. You can edit it later."}</small>
                <button className="ws-btn primary sm"><MessageSquareText aria-hidden="true" />{r.provider_response ? "Update reply" : "Post reply"}</button></div></ActionForm>
          : r.provider_response ? <blockquote style={{ margin: "12px 0 0", paddingLeft: 12, borderLeft: "3px solid #c7d2fe" }}><b>Your reply</b><p style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{r.provider_response}</p></blockquote> : null}
      </li>; })}</ul>
      : <Empty icon={Star} title={tab === "unanswered" && revs.length ? "Every review has a reply" : "No reviews yet"} text={revs.length ? "New reviews appear here and you're notified when one arrives." : "Reviews appear here after customers complete a booking and review it."} />}
  </div>;
}
