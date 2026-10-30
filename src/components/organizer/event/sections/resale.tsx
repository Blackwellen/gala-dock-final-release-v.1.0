import Link from "next/link";
import { Repeat, ShieldAlert, Rocket, Scale, ArrowRight } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { money, num, dateShort, time } from "@/lib/format";
import type { SectionProps } from "./types";
import { LaunchEditor, type LaunchSettings } from "./launch-client";

type Policy = { id: string; jurisdiction: string; version: number; effective_from: string; price_cap_pct: number; cap_basis: string; listing_cutoff_hours: number; max_active_listings_per_user: number | null;
  required_disclosures: string[]; legal_text: string; legal_review_status: string; legal_reviewed_at: string | null };
type Listing = { id: string; tier_name: string; seat: string | null; face_value_minor: number; price_minor: number; currency: string; status: string; policy_version: number | null; listed_at: string; closed_at: string | null };
type Flag = { id: string; kind: string; severity: string; status: string; order_ref: string | null; created_at: string; reviewed_at: string | null; review_note: string | null };
const LAUNCH: Record<string, [string, string, "green" | "blue" | "amber" | "red" | "gray" | "purple"]> = {
  draft: ["Draft", "Not published — nothing is on sale.", "gray"], coming_soon: ["Coming soon", "Launch is set more than a week out.", "blue"], countdown: ["Countdown", "Launch is within 7 days; the public page counts down.", "blue"],
  presale: ["Presale", "Only presale or access-code tiers are on sale.", "purple"], on_sale: ["On sale", "Tickets are on public sale.", "green"], low_availability: ["Low availability", "10% or less of tickets remain.", "amber"],
  final_release: ["Final release", "The final release tier is on sale.", "amber"], sold_out: ["Sold out", "No public tickets remain; resale is the only route.", "red"], waitlist: ["Sold out · waiting list", "Freed tickets are offered to the waiting list for 30 minutes each.", "purple"],
  ended: ["Ended", "The event has finished.", "gray"], cancelled: ["Cancelled", "The event is cancelled.", "red"], postponed: ["Postponed", "The event is postponed.", "amber"],
};
const FLAG: Record<string, string> = { order_velocity: "Many orders in a short time", shared_client: "Several accounts on one device", purchase_limit: "Purchase limit reached", chargeback: "Chargeback", resale_velocity: "Rapid resale listing", credential_abuse: "Ticket credential misuse" };
const DISCLOSE: Record<string, string> = { face_value: "Face value", seat_or_zone: "Seat or standing area", restrictions: "Use restrictions", ticket_terms: "Ticket terms" };
const L_TONE: Record<string, "green" | "gray" | "amber" | "blue"> = { listed: "blue", sold: "green", withdrawn: "gray", lapsed: "amber" };
const when = (iso?: string | null) => (iso ? `${dateShort(iso)} ${time(iso)}` : "");

/** Sell › Resale & risk (Q22): the resale policy in force, the event's listings, launch state and risk flags — read only. */
export async function ResaleSection({ e, role }: SectionProps) {
  const db = untyped(await createClient());
  const settings = (e.settings ?? {}) as Record<string, unknown>;
  const jurisdiction = String(settings.jurisdiction ?? "GB").toUpperCase();
  const [polQ, listQ, flagQ, launchQ] = await Promise.all([
    db.from("resale_policies").select("id,jurisdiction,version,effective_from,price_cap_pct,cap_basis,listing_cutoff_hours,max_active_listings_per_user,required_disclosures,legal_text,legal_review_status,legal_reviewed_at")
      .eq("jurisdiction", jurisdiction).eq("status", "published").lte("effective_from", new Date().toISOString()).order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("ticket_resale_listings").select("id,tier_name,seat,face_value_minor,price_minor,currency,status,policy_version,listed_at,closed_at").eq("event_id", e.id).order("listed_at", { ascending: false }).limit(200),
    db.from("ticket_risk_flags").select("id,kind,severity,status,order_ref,created_at,reviewed_at,review_note").eq("event_id", e.id).order("created_at", { ascending: false }).limit(100),
    db.rpc("event_launch_state", { p_event: e.id }),
  ]);
  const policy = polQ.data as Policy | null, listings = (listQ.data ?? []) as Listing[], flags = (flagQ.data ?? []) as Flag[];
  const launch = String(launchQ.data ?? "");
  const [ll, ld, lt] = LAUNCH[launch] ?? [launch || "Unknown", "", "gray"];
  const resaleOn = settings.resale !== false;
  const lc = (s: string) => listings.filter(l => l.status === s);
  const sold = lc("sold"), live = lc("listed");
  const avgMarkup = sold.length ? sold.reduce((s, l) => s + (l.face_value_minor ? l.price_minor / l.face_value_minor : 1), 0) / sold.length : null;
  const la = (settings.launch ?? {}) as LaunchSettings;
  const canLaunch = role === "owner" || role === "manager";
  const openFlags = flags.filter(f => f.status === "open");
  const base = `/organizer/events/${e.id}`;

  return <div className="ax-wrap">
    <div className="k-grid k-g4 ax-kpis">
      <div className="k-kpi"><span className="k-tile lg"><Repeat size={20} /></span><div className="k-grow"><div className="lbl">Resale</div><div className="val">{resaleOn ? "On" : "Off"}</div><div className="sub">{resaleOn ? "Official resale for ticket holders" : "Turned off in ticket settings"}</div></div></div>
      <div className="k-kpi"><span className="k-tile lg green"><Repeat size={20} /></span><div className="k-grow"><div className="lbl">Listed now</div><div className="val">{num(live.length)}</div><div className="sub">{num(sold.length)} resold · {num(lc("withdrawn").length + lc("lapsed").length)} withdrawn or lapsed</div></div></div>
      <div className="k-kpi"><span className="k-tile lg purple"><Rocket size={20} /></span><div className="k-grow"><div className="lbl">Launch state</div><div className="val" style={{ fontSize: 18 }}>{ll}</div><div className="sub">{ld}</div></div></div>
      <div className="k-kpi"><span className="k-tile lg amber"><ShieldAlert size={20} /></span><div className="k-grow"><div className="lbl">Open risk flags</div><div className="val">{num(openFlags.length)}</div><div className="sub">Reviewed by Gala Dock</div></div></div>
    </div>

    <div className="ax-grid">
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card>
          <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Resale listings</h2><p className="k-small">Buyers see face value, seat or area and restrictions on every listing. Each sale rotates the ticket so only one valid ticket exists.</p></div>
            <Link className="k-btn outline sm" href={`${base}/tickets/setup?step=4`}>Resale settings <ArrowRight size={12} /></Link></div>
          {listings.length ? <div className="k-table-wrap"><table className="k-table ax-table"><thead><tr><th>Ticket</th><th className="num">Face value</th><th className="num">Price</th><th>Status</th><th>Listed</th></tr></thead>
            <tbody>{listings.map(l => <tr key={l.id}>
              <td data-label="Ticket"><b className="k-strong">{l.tier_name || "Ticket"}</b>{l.seat && <div className="k-xs k-muted">{l.seat}</div>}</td>
              <td data-label="Face value" className="num">{money(l.face_value_minor / 100, l.currency, { decimals: true })}</td>
              <td data-label="Price" className="num">{money(l.price_minor / 100, l.currency, { decimals: true })}{l.face_value_minor > 0 && l.price_minor !== l.face_value_minor && <div className="k-xs k-muted">{Math.round((100 * l.price_minor) / l.face_value_minor)}% of face</div>}</td>
              <td data-label="Status"><Chip tone={L_TONE[l.status] ?? "gray"}>{l.status}</Chip>{l.policy_version && <div className="k-xs k-muted">policy v{l.policy_version}</div>}</td>
              <td data-label="Listed" className="k-xs">{when(l.listed_at)}{l.closed_at && <div className="k-muted">closed {when(l.closed_at)}</div>}</td>
            </tr>)}</tbody></table></div>
            : <Empty icon={Repeat} title="No resale listings" text={resaleOn ? "When ticket holders list tickets for official resale they appear here." : "Resale is off for this event — turn it on in ticket settings to let holders resell at face value."} />}
          {avgMarkup !== null && <p className="k-xs k-muted" style={{ marginTop: 8 }}>Resold tickets averaged {Math.round(avgMarkup * 100)}% of face value.</p>}
        </Card>
        <Card>
          <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Purchase risk flags</h2><p className="k-small">Automatic checks on fast or repeated buying, shared devices, purchase limits and chargebacks. Gala Dock reviews these — nobody is banned silently or permanently.</p></div></div>
          {flags.length ? <div className="k-table-wrap"><table className="k-table ax-table"><thead><tr><th>Signal</th><th>Severity</th><th>Order</th><th>Status</th><th>Raised</th></tr></thead>
            <tbody>{flags.map(f => <tr key={f.id}>
              <td data-label="Signal">{FLAG[f.kind] ?? f.kind}</td>
              <td data-label="Severity"><Chip tone={f.severity === "pause" ? "red" : f.severity === "review" ? "amber" : "gray"}>{f.severity === "pause" ? "Purchases paused 15 min" : f.severity === "review" ? "Needs review" : "Info"}</Chip></td>
              <td data-label="Order" className="k-xs">{f.order_ref ?? "—"}</td>
              <td data-label="Status"><Chip tone={f.status === "open" ? "amber" : f.status === "actioned" ? "red" : "green"}>{f.status === "open" ? "With Gala Dock" : f.status}</Chip>{f.review_note && <div className="k-xs k-muted">{f.review_note}</div>}</td>
              <td data-label="Raised" className="k-xs">{when(f.created_at)}</td>
            </tr>)}</tbody></table></div>
            : <p className="k-small">No risk flags for this event.</p>}
          <p className="k-xs k-muted" style={{ marginTop: 8 }}>Organisers can see flags but not clear them. If a genuine buyer is affected, contact Gala Dock support with the order reference.</p>
        </Card>
      </div>

      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card>
          <div className="ax-head"><h2 className="ov-h" style={{ fontSize: 15 }}><Scale size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Resale policy</h2>{policy && <Chip tone="blue">{policy.jurisdiction} v{policy.version}</Chip>}</div>
          {policy ? <>
            <dl className="ax-dl">
              <dt>Price cap</dt><dd>{Number(policy.price_cap_pct)}% of {policy.cap_basis === "face_value" ? "face value" : policy.cap_basis}</dd>
              <dt>Listing cut-off</dt><dd>{policy.listing_cutoff_hours ? `${policy.listing_cutoff_hours} h before the event` : "Until the event starts"}</dd>
              <dt>Listings per person</dt><dd>{policy.max_active_listings_per_user ?? "No limit"}</dd>
              <dt>Buyers are told</dt><dd>{policy.required_disclosures.map(x => DISCLOSE[x] ?? x).join(", ")}</dd>
              <dt>In force since</dt><dd>{dateShort(policy.effective_from)}</dd>
            </dl>
            {policy.legal_review_status === "needs_review"
              ? <p className="k-notice amber" style={{ marginTop: 10 }}><span><b>Draft — legal review pending.</b> This policy text hasn&apos;t been legally reviewed yet. Gala Dock doesn&apos;t claim it meets any legal requirement; check your own obligations for secondary ticketing.</span></p>
              : <p className="k-notice" style={{ marginTop: 10 }}><span>Legal text reviewed {policy.legal_reviewed_at ? dateShort(policy.legal_reviewed_at) : ""}. This is a platform rule, not legal advice.</span></p>}
            {policy.legal_text && <details style={{ marginTop: 8 }}><summary className="k-small k-link">Policy text</summary><p className="k-xs" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{policy.legal_text}</p></details>}
          </> : <p className="k-small">No published resale policy for {jurisdiction}. Resale stays at face value under the platform default until one is published.</p>}
        </Card>
        <Card>
          <div className="ax-head"><h2 className="ov-h" style={{ fontSize: 15 }}>Launch & waiting room</h2>{canLaunch && <LaunchEditor eventId={e.id} launch={la} startsAt={(e.starts_at as string | null) ?? null} />}</div>
          <dl className="ax-dl" style={{ marginTop: 8 }}>
            <dt>State</dt><dd><Chip tone={lt}>{ll}</Chip></dd>
            <dt>Presale opens</dt><dd>{la.presale_at ? when(la.presale_at) : "Not set"}</dd>
            <dt>Public launch</dt><dd>{la.at ? when(la.at) : "Not set"}</dd>
            <dt>Waiting room</dt><dd>{la.waiting_room?.enabled ? `On · ${la.waiting_room.rate_per_minute ?? "?"} admitted per minute, ${la.waiting_room.admit_minutes ?? "?"} min to buy` : "Off"}</dd>
          </dl>
          <p className="k-xs k-muted" style={{ marginTop: 8 }}>The state follows your tier statuses and sale windows (<Link className="k-link" href={`${base}/tickets/setup?step=2`}>tiers & releases</Link>). {canLaunch ? "Presale and launch times override tier windows for the public page; the waiting room queues buyers from the launch time." : "Owners and managers schedule presale, launch and the waiting room."}</p>
        </Card>
      </div>
    </div>
  </div>;
}
