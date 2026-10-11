import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink, Store, ChevronDown, MapPin, MessageSquareText, Clock3, CircleX, Funnel, Star, Pencil, CircleCheck, TriangleAlert, Ban, LayoutGrid, Utensils, ParkingCircle,
  Accessibility, Waves, Music, Building, ShieldCheck, ClipboardCheck, ArrowRight, Activity } from "lucide-react";
import "@/styles/admin-a-base.css";
import "@/styles/admin-a-profile.css";
import "@/styles/admin-a-listing.css";
import { Avatar, Thumb, Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { money, day, relative, requestTime, delta, titleCase } from "@/lib/workspace/format";
import { AdminMenu } from "../../../_a/client";
import { Status, SectionHead, KVRows, Flag, LineTabs, Delta, TimelineItem } from "../../../_a/ui";
import { shortRef, str, type SP } from "../../../_a/lib";
import { L_COLS, loadListingMetrics, cancelRate, fmtHours, type Listing } from "../../../_a/listings";
import { reviewListing, addRecordNote } from "../../../_a/actions";

export const metadata: Metadata = { title: "Listing review" };

type Details = { address?: { line1?: string; city?: string; postcode?: string }; features?: string[]; info?: { event_types?: string[]; parking?: string; accessibility?: string };
  commercial?: { pricing?: string; rate_from?: number; rate_to?: number; minimum_spend?: number; deposit_pct?: number; balance_days?: number; security_deposit?: number; cancellation?: { window: string; refund: number }[] };
  fnb?: { catering?: string; external_catering?: string }; operations?: { load_in?: string; load_out?: string }; suppliers?: { notes?: string };
  compliance?: { name: string; expires?: string; reference?: string }[]; reference?: string };
const featureIcon = (f: string) => /space/i.test(f) ? LayoutGrid : /cater|bar/i.test(f) ? Utensils : /park/i.test(f) ? ParkingCircle : /access/i.test(f) ? Accessibility : /river|water/i.test(f) ? Waves : /music|av|production/i.test(f) ? Music : Building;

export default async function ListingReviewPage(props: PageProps<"/admin/marketplace/listings/[id]">) {
  const ctx = await requireAdminPermission("marketplace");
  if (!ctx.allowed) return <Restricted area="Marketplace" />;
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const sp = (await props.searchParams) as SP;
  const tab = ["verification", "performance", "activity"].includes(str(sp, "tab")) ? str(sp, "tab") : "listing";
  const { db, permissions } = ctx;
  const now = requestTime();
  const l = await one<Listing>(db.from("listings").select(L_COLS).eq("id", id).maybeSingle());
  if (!l) notFound();
  const d = (l.details ?? {}) as Details;

  const [m30, m90, ws, spaces, requests, bookings, trust, audit, peers, notes] = await Promise.all([
    loadListingMetrics(db, 30).then(x => x.get(id)), loadListingMetrics(db, 90).then(x => x.get(id)),
    one<{ id: string; name: string; owner_id: string; settings: { reference?: string; company?: string } | null }>(db.from("workspaces").select("id,name,owner_id,settings").eq("id", l.workspace_id).maybeSingle()),
    rows<{ id: string; name: string; capacity_standing: number | null; capacity_seated: number | null; layouts: Record<string, number> | null; image: string; status: string }>(
      db.from("spaces").select("id,name,capacity_standing,capacity_seated,layouts,image,status").eq("venue_id", id).order("capacity_standing", { ascending: false })),
    rows<{ id: string; status: string; created_at: string; event: { name: string; event_type: string; guest_count: number | null } | null }>(
      db.from("build_items").select("id,status,created_at,event:events(name,event_type,guest_count)").eq("listing_id", id).not("status", "in", "(suggested,draft)").order("created_at", { ascending: false }).limit(tab === "performance" ? 20 : 3)),
    rows<{ id: string; event_name: string; starts_at: string | null; guests: number | null; value: number | null; status: string }>(
      db.from("provider_jobs").select("id,event_name,starts_at,guests,value,status").eq("listing_id", id).order("starts_at", { ascending: false }).limit(tab === "performance" ? 20 : 3)),
    permissions.has("trust") ? rows<{ id: string; category: string; status: string; risk_score: number }>(db.from("trust_cases").select("id,category,status,risk_score").eq("subject_type", "listing")
      .or(`subject_id.eq.${id},subject_name.eq."${l.name.replaceAll('"', "")}"`).in("status", ["open", "in_review"])) : Promise.resolve([]),
    permissions.has("audit") ? rows<{ id: number; event: string; metadata: Record<string, unknown>; created_at: string }>(db.from("audit_events").select("id,event,metadata,created_at")
      .eq("metadata->>listing_id", id).order("created_at", { ascending: false }).limit(tab === "activity" ? 40 : 5)) : Promise.resolve([]),
    rows<{ response_hours: number | null }>(db.from("listings").select("response_hours").eq("kind", l.kind).eq("published", true)),
    rows<{ id: number; body: string; author_name: string; created_at: string }>(db.from("admin_record_notes").select("id,body,author_name,created_at").eq("subject_type", "listing").eq("subject_id", id).order("created_at", { ascending: false }).limit(5)),
  ]);
  const owner = ws && (permissions.has("users") || permissions.has("support")) ? await one<{ id: string; full_name: string; avatar_url: string }>(db.from("profiles").select("id,full_name,avatar_url").eq("id", ws.owner_id).maybeSingle()) : null;
  const gallery = [l.image, ...(l.gallery ?? [])].filter((x, i, a) => x && a.indexOf(x) === i);
  const tags = [...new Set([...(d.info?.event_types ?? []), ...(l.tags ?? [])])];
  const conv = m30?.requests ? Math.round((100 * m30.confirmed) / Math.max(m30.requests, m30.confirmed)) : 0;
  const peerAvg = peers.length ? peers.reduce((a, p) => a + (p.response_hours ?? 0), 0) / peers.length : 0;
  const respVsPeers = peerAvg && l.response_hours ? Math.round(((peerAvg - l.response_hours) / peerAvg) * 100) : null;
  const docs = (d.compliance ?? []).map(c => ({ ...c, ok: !c.expires || new Date(c.expires).getTime() > now }));
  const closedDays = l.details && (l.details as { hours?: Record<string, unknown> }).hours ? 7 - Object.keys((l.details as { hours: Record<string, unknown> }).hours).length : null;
  const base = `/admin/marketplace/listings/${id}`;
  const status = l.review_status === "suspended" ? { k: "suspended", t: "Suspended" } : l.review_status === "restricted" ? { k: "restricted", t: "Restricted" } : !l.published ? { k: "draft", t: "Unpublished" } : l.paused_at ? { k: "paused", t: "Paused" } : { k: "active", t: "Active" };
  const decide = (decision: "approve" | "request_changes" | "restrict" | "suspend", title: string, body: string, cta: string) => ({ action: reviewListing, args: [id, decision], reason: true, confirm: { title, body, cta } });
  const checks = [
    { ok: docs.length > 0 && docs.every(x => x.ok), text: docs.length ? (docs.every(x => x.ok) ? "All compliance documents are in date." : `${docs.filter(x => !x.ok).length} compliance document(s) expired.`) : "No compliance documents on file." },
    { ok: respVsPeers === null || respVsPeers >= 0, text: respVsPeers === null ? "Not enough response data to compare." : `Response time is ${Math.abs(respVsPeers)}% ${respVsPeers >= 0 ? "better" : "worse"} than the ${l.kind} average.` },
    { ok: cancelRate(m90) <= 3, warn: true, text: `Cancellation rate is ${cancelRate(m90).toFixed(1)}% over 90 days.` },
    { ok: closedDays === null || closedDays === 0, warn: true, text: closedDays ? `Closed ${closedDays} day(s) a week — consider adding availability.` : "Open seven days a week." },
  ];

  const detailsPanel = <section className="aa-panel al-details">
    <SectionHead title="Listing details"><Link className="aa-edit" href={`${base}?tab=activity`}><Pencil aria-hidden="true" />Notes &amp; history</Link></SectionHead>
    <KVRows rows={[
      ["Name", l.name], ["Type", titleCase(l.kind)],
      ["Categories", <span key="c" className="al-tags">{[l.category, ...tags.slice(0, 2)].filter(Boolean).map(t => <span key={t} className="aa-chip">{t}</span>)}</span>],
      ["Description", <span key="d" className="al-desc">{l.description || "—"}</span>],
      ["Location", <span key="l" className="aa-loc"><MapPin aria-hidden="true" />{l.location || l.city}</span>],
      ["Capacity", l.capacity_max ? `${l.capacity_min ?? 1} – ${l.capacity_max.toLocaleString("en-GB")}${spaces.length > 1 ? " (multiple spaces)" : ""}` : "—"],
      ["Availability mode", <span key="a" className="al-tags"><span className={`aa-chip ${l.booking_mode === "instant" || l.instant_book ? "green" : "grey"}`}>Instant booking</span>
        <span className={`aa-chip ${l.booking_mode === "request" ? "amber" : "grey"}`}>Request</span><span className={`aa-chip ${l.booking_mode === "enquiry" ? "blue" : "grey"}`}>Enquiry</span></span>],
    ]} />
    {(d.features ?? []).length > 0 && <div className="al-features"><span>Key features</span><ul>{(d.features ?? []).slice(0, 5).map(f => { const I = featureIcon(f); return <li key={f}><I aria-hidden="true" />{f}</li>; })}</ul></div>}
  </section>;
  const galleryPanel = <section className="aa-panel al-gallery">
    <SectionHead title={<>Media gallery <span>({gallery.length})</span></>} />
    {gallery.length ? <div className="al-grid">{gallery.slice(0, 6).map((g, i) => <a key={g} href={g} target="_blank" rel="noreferrer" className={`g${i}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={g} alt={`${l.name} photo ${i + 1}`} loading="lazy" />{i === 5 && gallery.length > 6 && <b>+{gallery.length - 6}</b>}</a>)}</div>
      : <p className="aa-empty">No photos uploaded.</p>}
  </section>;
  const c = d.commercial ?? {};
  const rulesPanel = <section className="aa-panel al-rules">
    <SectionHead title="Booking rules &amp; commercial" />
    <KVRows rows={[
      ["Minimum spend", c.minimum_spend ? money(c.minimum_spend) : "—"],
      ["Hire pricing", c.rate_from ? `From ${money(c.rate_from)}${c.pricing === "hourly" ? " per hour" : ""}${c.rate_to ? ` (up to ${money(c.rate_to)})` : ""}` : l.price_from ? `From ${money(l.price_from)} ${l.price_unit ?? ""}` : "—"],
      ["F&B options", [d.fnb?.catering && `Catering: ${d.fnb.catering}`, d.fnb?.external_catering && `external ${d.fnb.external_catering.toLowerCase()}`].filter(Boolean).join(", ") || "—"],
      ["Payment terms", c.deposit_pct ? `${c.deposit_pct}% deposit, balance ${c.balance_days ?? 14} days before event` : "—"],
      ["Cancellation policy", c.cancellation?.length ? c.cancellation.map(x => `${x.window}: ${x.refund}%`).join(" · ") : "—"],
      ["Setup / breakdown", d.operations?.load_in ? `Load-in ${d.operations.load_in}, load-out ${d.operations.load_out ?? "—"}` : "—"],
      ["Security deposit", c.security_deposit ? money(c.security_deposit) : "—"],
    ]} />
  </section>;
  const spacesPanel = <section className="aa-panel al-spaces">
    <SectionHead title="Spaces &amp; layouts" />
    {spaces.length ? <ul>{spaces.slice(0, 4).map(s => <li key={s.id}><Thumb src={s.image || null} w={50} h={30} /><div><b>{s.name}</b><small>{(s.capacity_standing ?? s.capacity_seated ?? 0).toLocaleString("en-GB")} capacity</small></div>
      <span className="al-tags">{Object.keys(s.layouts ?? {}).slice(0, 3).map(k => <span key={k} className="aa-chip">{titleCase(k)}</span>)}</span>
      <Status value={s.status === "published" ? "active" : "draft"} label={titleCase(s.status)} dot={false} /></li>)}</ul> : <p className="aa-empty">{l.kind === "venue" ? "No spaces configured." : "Spaces apply to venues only."}</p>}
  </section>;
  const reqPanel = <section className="aa-panel al-req">
    <SectionHead title="Recent requests" href={tab === "performance" ? undefined : `${base}?tab=performance`} />
    {requests.length ? <table className="aa-mtable"><thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Guests</th><th>Status</th></tr></thead><tbody>{requests.map(r => <tr key={r.id}>
      <td>{relative(r.created_at, now)}</td><td>{r.event?.name ?? "—"}</td><td className="aa-muted">{titleCase(r.event?.event_type ?? "")}</td><td>{r.event?.guest_count ?? "—"}</td>
      <td><Status value={["confirmed", "fulfilled"].includes(r.status) ? "confirmed" : ["expired", "declined", "cancelled"].includes(r.status) ? "cancelled" : "pending"} label={titleCase(r.status)} dot={!["confirmed", "fulfilled"].includes(r.status)} /></td></tr>)}</tbody></table>
      : <p className="aa-empty">No requests yet.</p>}
  </section>;
  const bookPanel = <section className="aa-panel al-book">
    <SectionHead title="Recent bookings" href={tab === "performance" ? undefined : `${base}?tab=performance`} />
    {bookings.length ? <table className="aa-mtable"><thead><tr><th>Date</th><th>Event</th><th>Guests</th><th>Value</th><th>Status</th></tr></thead><tbody>{bookings.map(b => <tr key={b.id}>
      <td>{day(b.starts_at, { day: "numeric", month: "short", year: "numeric" })}</td><td>{b.event_name}</td><td>{b.guests?.toLocaleString("en-GB") ?? "—"}</td><td>{b.value ? money(b.value) : "—"}</td>
      <td><Status value={b.status === "completed" ? "completed" : b.status === "cancelled" ? "cancelled" : "confirmed"} label={titleCase(b.status)} dot={false} /></td></tr>)}</tbody></table>
      : <p className="aa-empty">No bookings yet.</p>}
  </section>;
  const compliancePanel = <section className="aa-panel al-comp">
    <SectionHead title="Trust &amp; compliance" href={permissions.has("trust") ? `/admin/trust?q=${encodeURIComponent(l.name)}` : undefined} label="View details" />
    <KVRows rows={[["Listing verification", l.verified ? <Status key="v" value="verified" label="Verified" /> : <Status key="v" value="pending" label="Pending" />],
      ...docs.slice(0, tab === "verification" ? 20 : 3).map(x => [x.name, x.ok ? <Status key={x.name} value="verified" label="Verified" /> : <Status key={x.name} value="cancelled" label="Expired" />] as [string, ReactNode])]} />
    <p className={`al-flagline ${trust.length ? "bad" : ""}`}><ShieldCheck aria-hidden="true" />{trust.length ? `${trust.length} active policy flag${trust.length > 1 ? "s" : ""}: ${trust.map(t => t.category).join(", ")}` : "No active policy flags"}</p>
  </section>;
  const activityPanel = <section className="aa-panel">
    <SectionHead title="Review history" />
    {!permissions.has("audit") ? <p className="aa-empty">History needs the Audit permission.</p> : audit.length ? <ul className="aa-tls">{audit.map(a => <TimelineItem key={a.id} icon={Activity}
      title={titleCase(a.event.replace("admin.listing_", "Admin: ").replace(/\./g, " "))} meta={`${relative(a.created_at, now)}${a.metadata?.reason ? ` · ${a.metadata.reason}` : ""}`} />)}</ul> : <p className="aa-empty">No review decisions recorded yet.</p>}
    <ActionForm action={addRecordNote.bind(null, "listing", id)} className="aa-note-form al-note" resetOnSuccess>
      <label className="sr-only" htmlFor="al-note">Internal note</label><input id="al-note" name="body" placeholder="Add an internal review note..." maxLength={2000} required minLength={2} />
      <button type="submit" className="ws-btn primary">Add note</button></ActionForm>
    {notes.map(n => <div key={n.id} className="aa-note"><span className="ap-note-ico"><Pencil aria-hidden="true" /></span><div><small><b>{n.author_name}</b> · {relative(n.created_at, now)}</small><p>{n.body}</p></div></div>)}
  </section>;

  return <div className="aa al">
    <Link className="aa-back" href="/admin/marketplace"><ArrowLeft aria-hidden="true" />Back to Marketplace</Link>
    <header className="aa-hero al-hero">
      <div className="al-cover"><Thumb src={l.image || null} w={210} h={115} />{gallery.length > 0 && <span>1/{gallery.length}</span>}</div>
      <div>
        <h1>{l.name} <Status value={status.k} label={status.t} /></h1>
        <p className="aa-hero-meta">{shortRef("LST", id, d.reference)}<span className="sep">•</span>{titleCase(l.kind)}{l.sponsored && <span className="aa-status amber dot">Sponsored</span>}
          {l.verified && <Status value="verified" label="Verified" />}{l.review_status !== "approved" && <Status value={l.review_status === "pending" ? "pending" : l.review_status} label={`Review: ${titleCase(l.review_status)}`} />}</p>
        <p className="aa-hero-meta"><MapPin aria-hidden="true" className="al-pin" />{[d.address?.line1, d.address?.city ?? l.city, d.address?.postcode].filter(Boolean).join(", ") || l.location}<Flag country="GB" /></p>
        <p className="al-tags al-herotags">{tags.slice(0, 5).map(t => <span key={t} className="aa-chip">{t}</span>)}{tags.length > 5 && <span className="aa-chip">+{tags.length - 5}</span>}</p>
      </div>
      <div className="aa-hero-actions">
        {l.published && l.slug && l.review_status !== "suspended" ? <Link className="ws-btn outline" href={`/${l.kind === "venue" ? "venues" : "services"}/${l.slug}`}><ExternalLink aria-hidden="true" />View public listing</Link> : null}
        {ws && <Link className="ws-btn outline" href={`/admin/workspaces/${ws.id}`}><Store aria-hidden="true" />Open provider</Link>}
        <AdminMenu label="More actions" className="ws-btn outline al-more" trigger={<>More actions<ChevronDown aria-hidden="true" /></>} entries={[
          { kind: "link", label: "Export (CSV)", href: `/admin/marketplace/export?id=${id}` }, { kind: "link", label: "Review history", href: `${base}?tab=activity` },
          ...(owner ? [{ kind: "link" as const, label: "View owner", href: `/admin/users/${owner.id}` }] : [])]} />
      </div>
    </header>
    <LineTabs base={base} sp={sp} active={tab} className="ap-tabs al-tabs" tabs={[{ key: "listing", label: "Listing" }, { key: "verification", label: "Verification" }, { key: "performance", label: "Performance" }, { key: "activity", label: "Activity" }]} />

    <div className="al-layout">
      <div className="al-main">
        <section className="al-kpis" aria-label="Listing metrics">
          <div><span className="aa-tile blue"><MessageSquareText aria-hidden="true" /></span><div><b>{m30?.requests ?? 0}</b><small>Requests (30d)</small><Delta value={delta(m30?.requests ?? 0, m30?.requests_prev ?? 0)} /></div></div>
          <div><span className="aa-tile red"><Clock3 aria-hidden="true" /></span><div><b>{fmtHours(l.response_hours)}</b><small>Avg response time</small>{respVsPeers !== null && <Delta value={-respVsPeers} invert />}</div></div>
          <div><span className="aa-tile red"><CircleX aria-hidden="true" /></span><div><b>{cancelRate(m90).toFixed(1)}%</b><small>Cancellation rate</small></div></div>
          <div><span className="aa-tile blue"><Funnel aria-hidden="true" /></span><div><b>{conv}%</b><small>Conversion rate</small></div></div>
          <div><span className="aa-tile amber"><Star aria-hidden="true" /></span><div><b>{l.rating ? `${Number(l.rating).toFixed(1)}/5` : "—"}</b><small>Average rating</small><small className="al-stars">{"★★★★★".slice(0, Math.round(Number(l.rating ?? 0)))} ({l.review_count})</small></div></div>
        </section>
        {tab === "listing" && <div className="al-cols">{detailsPanel}{galleryPanel}{rulesPanel}{spacesPanel}{reqPanel}{bookPanel}</div>}
        {tab === "verification" && <div className="al-cols">{compliancePanel}{activityPanel}</div>}
        {tab === "performance" && <div className="al-cols">{reqPanel}{bookPanel}</div>}
        {tab === "activity" && <div className="al-cols one">{activityPanel}</div>}
      </div>
      <aside className="al-side">
        <section className="aa-panel al-status">
          <KVRows rows={[
            ["Listing status", <Status key="s" value={status.k} label={status.t} />],
            ["Verification", l.verified ? <Status key="v" value="verified" label="Verified" /> : <Status key="v" value="pending" label="Pending" />, <Link key="vd" className="aa-link" href={`${base}?tab=verification`}>View details ›</Link>],
            ["Review", titleCase(l.review_status)],
            ["Featured", l.sponsored ? "Sponsored placement" : "No"],
            ["Created", day(l.created_at, { day: "numeric", month: "short", year: "numeric" })],
            ["Last updated", day(l.updated_at, { day: "numeric", month: "short", year: "numeric" })],
            ["Owner", owner ? <Link key="o" className="aa-who al-owner" href={`/admin/users/${owner.id}`}><Avatar src={owner.avatar_url} name={owner.full_name} size={30} /><span><b>{owner.full_name}</b><small>{shortRef("USR", owner.id)} · {ws?.settings?.company ?? ws?.name}</small></span></Link> : ws?.name ?? "—"],
          ]} />
        </section>
        <section className="aa-panel al-actions">
          <SectionHead title="Admin actions" />
          <ActionButton {...decide("approve", `Approve ${l.name}?`, "Marks the listing verified and approved. The provider is notified.", "Approve")} variant="outline" className="al-a green"><CircleCheck aria-hidden="true" />Approve listing</ActionButton>
          <ActionButton {...decide("request_changes", `Request changes to ${l.name}?`, "The provider is asked to update the listing. It stays live meanwhile.", "Request changes")} variant="outline" className="al-a blue"><Pencil aria-hidden="true" />Request changes</ActionButton>
          <ActionButton {...decide("restrict", `Restrict ${l.name}?`, "The listing is unpublished and can’t be republished by the provider until reviewed. Appealable.", "Restrict listing")} variant="outline" className="al-a amber"><TriangleAlert aria-hidden="true" />Restrict listing</ActionButton>
          <ActionButton {...decide("suspend", `Suspend ${l.name}?`, "The listing is unpublished immediately and existing requests are flagged. Appealable.", "Suspend listing")} variant="danger" className="al-a red"><Ban aria-hidden="true" />Suspend listing</ActionButton>
        </section>
        <section className="aa-panel al-insights">
          <SectionHead title={<>Review checks <em className="aa-chip">Automated</em></>} />
          <div className="al-ins"><b><ClipboardCheck aria-hidden="true" />Listing review summary</b>
            <ul>{checks.map((x, i) => <li key={i} className={x.ok ? "ok" : x.warn ? "warn" : "bad"}>{x.text}</li>)}</ul>
            <Link className="ws-btn outline block" href={`${base}?tab=verification`}>Open full review <ArrowRight aria-hidden="true" /></Link></div>
        </section>
        {tab !== "verification" && compliancePanel}
      </aside>
    </div>
  </div>;
}
