import type { Metadata } from "next";
import Link from "next/link";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton } from "@/components/workspace/actions";
import { getAdmin } from "@/lib/admin/context";
import { requestTime } from "@/lib/workspace/format";
import { Head, TabBar, Pill, Pager } from "../../_b/kit";
import { stamp, ago } from "../../_b/format";
import { moderateReviewReply } from "../../_d/actions";
import "@/styles/admin-b.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Review replies" };

type Row = { id: string; listing_id: string | null; rating: number; body: string; created_at: string; provider_response: string | null; responded_at: string | null;
  response_updated_at: string | null; response_status: string | null; response_moderation_reason: string | null; listing: { name: string; slug: string | null; kind: string } | null };
const PER = 25;

/** Q51: providers' public replies to reviews (Q62), with the admin moderation the RPC already supports. Trust or Marketplace.
 *  Removing a reply takes its text off the public row (the audit keeps it) and tells the provider why; "Allow a new reply"
 *  lifts the block. Reviewer identities are not shown or needed here. */
export default async function ReviewRepliesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const admin = await getAdmin();
  if (!admin.permissions.has("trust") && !admin.permissions.has("marketplace")) return <Restricted area="Review replies" />;
  const tab = sp.tab === "hidden" ? "hidden" : "replies";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const now = requestTime();
  let q = admin.db.from("reviews").select("id,listing_id,rating,body,created_at,provider_response,responded_at,response_updated_at,response_status,response_moderation_reason,listing:listings(name,slug,kind)", { count: "exact" })
    .eq("status", "published");
  q = tab === "hidden" ? q.eq("response_status", "hidden") : q.not("provider_response", "is", null);
  const { data, count, error } = await q.order(tab === "hidden" ? "updated_at" : "responded_at", { ascending: false, nullsFirst: false }).range((page - 1) * PER, page * PER - 1);
  if (error) throw new Error(error.message);   // never show "no replies" when the read failed
  const list = (data ?? []) as unknown as Row[];
  const href = (p: number) => `/admin/trust/review-replies?${new URLSearchParams({ ...(tab === "hidden" ? { tab } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  const listingHref = (r: Row) => r.listing?.slug ? `/${r.listing.kind === "venue" ? "venues" : "services"}/${r.listing.slug}` : null;

  return <div className="adb add">
    <Head back={{ href: "/admin/trust", label: "Back to Trust & Safety" }} title="Review replies"
      subtitle="Providers’ public replies to customer reviews. Remove a reply that breaks the review policy (personal data, abuse, threats, off-topic promotion); the provider is told why and the removed text stays in the audit log." />
    <TabBar active={tab} tabs={[{ key: "replies", label: "Published replies", href: "/admin/trust/review-replies" }, { key: "hidden", label: "Removed replies", href: "/admin/trust/review-replies?tab=hidden" }]} />
    <section className="adb-panel">
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true">
        <thead><tr><th>Listing</th><th>Review</th><th>{tab === "hidden" ? "Why it was removed" : "Provider reply"}</th><th>{tab === "hidden" ? "Status" : "Replied"}</th><th /></tr></thead>
        <tbody>{list.length ? list.map(r => { const pub = listingHref(r); return <tr key={r.id}>
          <td><b>{r.listing?.name ?? "Listing"}</b>{pub && <small><Link href={pub} target="_blank" rel="noopener noreferrer">Public page</Link></small>}</td>
          <td><small>{"★".repeat(Math.max(0, Math.min(5, r.rating)))} · {ago(r.created_at, now)}</small><small>{r.body.slice(0, 220)}{r.body.length > 220 ? "…" : ""}</small></td>
          <td>{tab === "hidden" ? <small>{r.response_moderation_reason ?? "—"}</small> : <small>{(r.provider_response ?? "").slice(0, 320)}{(r.provider_response ?? "").length > 320 ? "…" : ""}</small>}</td>
          <td>{tab === "hidden" ? <Pill status="hold" label="Removed" /> : <small>{stamp(r.response_updated_at ?? r.responded_at)}</small>}</td>
          <td><span className="add-acts">{tab === "hidden"
            ? <ActionButton action={moderateReviewReply} args={[r.id, false]} reason variant="outline" confirm={{ title: "Allow a new reply", body: "The provider can post a new public reply to this review. They are notified with your reason.", cta: "Allow a new reply" }}>Allow a new reply</ActionButton>
            : <ActionButton action={moderateReviewReply} args={[r.id, true]} reason variant="danger" confirm={{ title: "Remove this reply", body: "The reply disappears from the public listing page and the provider can’t re-post it until you allow a new reply. Your reason is sent to the provider and recorded in the audit log.", cta: "Remove reply" }}>Remove reply</ActionButton>}</span></td>
        </tr>; }) : <tr><td colSpan={5} className="adb-none">{tab === "hidden" ? "No removed replies." : "No provider replies yet."}</td></tr>}</tbody>
      </table>
      {(count ?? 0) > PER && <Pager total={count ?? 0} page={page} per={PER} href={href} />}
    </section>
  </div>;
}
