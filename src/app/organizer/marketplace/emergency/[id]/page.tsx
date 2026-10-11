import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { PageHead } from "@/components/kit";
import { EmergencyDecision } from "@/components/marketplace/emergency-client";
import { categoryLabel, SEVERITY, CANDIDATE_STATUS } from "@/lib/marketplace/emergency";
import { money, dateShort, time } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Emergency request" };
type Cand = { id: string; workspace_id: string; listing_id: string | null; distance_km: number | null; status: string; quote_amount: number | null; eta_minutes: number | null; note: string; responded_at: string | null; build_item_id: string | null };

/** One emergency request: who was contacted, delivery/open/interest/quote tracking, accept one quote. */
export default async function EmergencyRequestPage({ params }: PageProps<"/organizer/marketplace/emergency/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(`/organizer/marketplace/emergency/${id}`);
  const db = untyped(ctx.supabase as never);
  const { data: r } = await db.from("emergency_requests").select("*, events!inner(id,name,workspace_id)").eq("id", id).eq("events.workspace_id", ctx.workspace.id).maybeSingle();
  if (!r) notFound();
  const { data: cands } = await db.from("emergency_candidates").select("id,workspace_id,listing_id,distance_km,status,quote_amount,eta_minutes,note,responded_at,build_item_id").eq("request_id", id).order("quote_amount", { ascending: true, nullsFirst: false });
  const listingIds = ((cands ?? []) as Cand[]).map(c => c.listing_id).filter(Boolean);
  const { data: listings } = listingIds.length ? await db.from("listings").select("id,name,rating,review_count,slug").in("id", listingIds) : { data: [] };
  const L = new Map((listings ?? []).map((l: { id: string; name: string; rating: number | null; review_count: number | null }) => [l.id, l]));
  const open = r.status === "open" || r.status === "matching";
  const accepted = ((cands ?? []) as Cand[]).find(c => c.status === "accepted");
  const counts = ((cands ?? []) as Cand[]).reduce((a, c) => { a.seen += c.status !== "delivered" ? 1 : 0; a.replied += ["interested", "quoted", "declined", "accepted", "not_selected"].includes(c.status) && c.responded_at ? 1 : 0; return a; }, { seen: 0, replied: 0 });
  return <div className="k-col" style={{ gap: 16 }}>
    <PageHead crumbs={[{ label: "Organizer", href: "/organizer" }, { label: "Marketplace", href: "/organizer/marketplace" }, { label: "Emergency Supply", href: "/organizer/marketplace/emergency" }, { label: r.reference }]}
      title={`${categoryLabel(r.category)} — ${r.events.name}`} sub={`Needed on site by ${dateShort(r.required_arrival)}, ${time(r.required_arrival)}${r.location ? ` · ${r.location}` : ""}`}
      actions={open ? <EmergencyDecision requestId={r.id} kind="cancel" /> : undefined} />
    <div className="mk-page">
      <div className="mk-row"><span className={`mk-tag ${SEVERITY[r.severity]?.[1]}`}>{SEVERITY[r.severity]?.[0]}</span>
        <span className="mk-tag grey">{r.pool_size} contacted · {counts.seen} seen · {counts.replied} replied</span>
        {r.budget_max != null && <span className="mk-tag grey">Budget up to {money(r.budget_max)}</span>}</div>
      {accepted?.build_item_id && <p className="mk-note">You accepted a quote. <Link className="mk-link" href={`/organizer/marketplace/bookings/${accepted.build_item_id}`}>Confirm and pay for the booking</Link>.</p>}
      {r.scope && <section className="mk-card"><h2>Scope</h2><p className="mk-note">{r.scope}</p>{r.failure_reason && <p className="mk-note">What happened: {r.failure_reason}</p>}</section>}
      <section className="mk-card" aria-labelledby="em-c"><h2 id="em-c">Providers contacted</h2>
        {!(cands ?? []).length ? <p className="mk-empty">No opted-in providers are available in range for this category right now. Try widening the location, or post a standard marketplace request.</p> :
        <ul className="mk-list">{((cands ?? []) as Cand[]).map(c => { const l = c.listing_id ? L.get(c.listing_id) : null; const [label, tone] = CANDIDATE_STATUS[c.status] ?? [c.status, "grey"]; return <li key={c.id}>
          <div className="mk-main"><b>{l?.name ?? "Provider"}</b>
            <small>{c.distance_km != null ? `${c.distance_km} km away` : "Distance unknown"}{l?.rating ? ` · ★ ${Number(l.rating).toFixed(1)}` : ""}{c.eta_minutes != null ? ` · arrives in ~${c.eta_minutes} min` : ""}</small>
            {c.note && <small>“{c.note}”</small>}</div>
          <span className="mk-row">{c.quote_amount != null && <b>{money(c.quote_amount)}</b>}<span className={`mk-tag ${tone}`}>{label}</span>
            {open && c.status === "quoted" && <EmergencyDecision candidateId={c.id} kind="accept" />}</span>
        </li>; })}</ul>}
      </section>
    </div>
  </div>;
}
