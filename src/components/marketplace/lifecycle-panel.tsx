import Link from "next/link";
import { CalendarClock, CreditCard, LifeBuoy, MapPin, ShieldAlert, Undo2 } from "lucide-react";
import { ProviderSelfCheckin } from "@/components/live/live-client";
import { createClient } from "@/lib/supabase/server";
import { loadLifecycle, STATUS_LABEL, DISPUTE_REASONS, DISPUTE_STATUS } from "@/lib/marketplace/lifecycle";
import { requestTime } from "@/lib/workspace/format";
import { money, dateShort, time } from "@/lib/format";
import { PAYMENT_STATE } from "@/lib/commerce/orchestrator";
import { venueBlocks } from "@/components/venue/venue-blocks";
import { Countdown, PayButton, ActButton, HoldRequestForm, HoldRespondForm, StandbyRequestForm, StandbyOfferForm, CancelForm, DisputeOpenForm } from "./lifecycle-client";
import "@/styles/marketplace.css";

type Viewer = "organizer" | "provider" | "customer";
const DISPUTE_BASE: Record<Viewer, string> = { organizer: "/organizer/disputes", provider: "/provider/disputes", customer: "/account/disputes" };
const HOLD_LABEL: Record<string, string> = { requested: "Hold requested", held: "On hold", declined: "Hold declined", released: "Hold released", expired: "Hold expired", converted: "Converted to booking", cancelled: "Hold cancelled" };
const SB_LABEL: Record<string, string> = { requested: "Standby requested", offered: "Standby offered", accepted: "On standby", activated: "Standby activated", released: "Standby released", expired: "Standby expired", declined: "Standby declined", cancelled: "Standby withdrawn" };
const Tag = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={`mk-tag ${tone}`}>{children}</span>;
const when = (iso: string | null) => iso ? `${dateShort(iso)}, ${time(iso)}` : "—";

/**
 * Marketplace lifecycle for one booking line, shared by the Organizer, Provider and Customer portals.
 * Shows the response countdown, conditional holds, paid standby, cancellations and disputes with the actions the viewer may take.
 * The database decides permissions and legality; buttons only appear where the viewer can act. With `quiet`, renders nothing
 * unless there is lifecycle activity (keeps ordinary request pages unchanged).
 */
export async function LifecyclePanel({ itemId, viewer, quiet = viewer === "provider", returnPath }: { itemId: string; viewer: Viewer; quiet?: boolean; returnPath?: string }) {
  const supabase = await createClient();
  const lc = await loadLifecycle(supabase, itemId);
  if (!lc) return null;
  const { item, holds, standby, cancellations, disputes, siblings, event, payments } = lc;
  const isEvent = viewer !== "provider";
  const openHold = holds.find(h => h.status === "requested" || h.status === "held");
  const openSb = standby.find(s => ["requested", "offered", "accepted"].includes(s.status));
  const openCancel = cancellations.find(c => c.status === "requested" || c.status === "manual_review");
  const openDispute = disputes.find(d => d.status !== "resolved");
  const activity = holds.length + standby.length + cancellations.length + disputes.length + payments.length > 0;
  const back = returnPath ?? (viewer === "customer" ? `/account/events/${event.id}/bookings/${item.id}` : `/organizer/marketplace/bookings/${item.id}`);
  const paidMinor = payments.filter(p => !["amount_due", "payment_pending", "failed", "cancelled"].includes(p.status)).reduce((a, p) => a + p.amount_minor - p.refunded_minor, 0);
  const balanceDue = item.amount != null && ["confirmed", "active", "fulfilled", "completion_pending"].includes(item.status) && paidMinor > 0 ? Math.round(Number(item.amount) * 100) - paidMinor : 0;
  const emergency = (item.terms_snapshot as { source?: string } | null)?.source === "emergency";
  const payable = ["quoted", "available", "held", "conditionally_held"].includes(item.status) && item.amount != null;
  const venue = await venueBlocks(supabase, { itemId: item.id, listingId: item.listing_id, status: item.status, eventId: event.id, viewer, starts: event.starts_at, ends: event.ends_at });
  const eventDay = viewer === "provider" && ["confirmed", "active"].includes(item.status) && !!event.starts_at && Date.parse(event.starts_at) - requestTime() < 12 * 36e5 && requestTime() < Date.parse(event.ends_at ?? event.starts_at) + 6 * 36e5;
  const { data: checkin } = eventDay ? await supabase.from("provider_checkins" as never).select("status").eq("build_item_id", item.id).maybeSingle() : { data: null };
  if (quiet && !activity && !venue.active && !eventDay) return null;
  const [label, tone] = STATUS_LABEL[item.status] ?? [item.status, "grey"];
  const responding = ["sent", "awaiting", "awaiting_provider"].includes(item.status) || item.response_status === "expired";
  const holdable = ["available", "quoted", "quote_received", "quote_revised", "customer_reviewing"].includes(item.status);
  const cancellable = ["confirmed", "held", "conditionally_held", "awaiting_payment", "awaiting_confirmation", "active", "standby_accepted"].includes(item.status);
  const disputable = ["confirmed", "active", "fulfilled", "completion_pending", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_provider", "partially_refunded"].includes(item.status);
  const others = siblings.filter(s => !["declined", "unavailable", "expired"].includes(s.status));
  const now = requestTime();

  return <section className="mk-panel" aria-labelledby={`mk-${item.id}`}>
    <header className="mk-head">
      <h2 id={`mk-${item.id}`}>Booking lifecycle</h2>
      <Tag tone={tone}>{label}</Tag>
    </header>
    {responding && <div className="mk-block"><Countdown deadline={item.response_deadline} sentAt={item.sent_at} status={item.response_status} serverNow={now} />
      {item.response_status === "expired" && <p className="mk-note">The provider didn’t respond in time. This is recorded as no response — not as declined or unavailable.</p>}</div>}

    {(payments.length > 0 || (isEvent && (payable || balanceDue > 0 || openSb?.fee_status === "due"))) && <div className="mk-block" id="payments">
      <h3><CreditCard size={15} aria-hidden="true" />Payments</h3>
      {payments.map(p => { const [l, t] = PAYMENT_STATE[p.status] ?? [p.status, "grey"]; return <p key={p.id} className="mk-line"><Tag tone={t}>{l}</Tag><span>{p.description} · {money(p.amount_minor / 100)}{p.refunded_minor ? ` (refunded ${money(p.refunded_minor / 100)})` : ""} · {p.reference}</span></p>; })}
      {isEvent && payable && <PayButton kind={emergency ? "emergency_service" : "deposit"} itemId={item.id} returnPath={back} label={emergency ? `Pay ${money(item.amount)} and confirm` : "Pay deposit and confirm"} amount={emergency && item.amount != null ? Number(item.amount) : undefined}
        note={emergency ? "Emergency bookings are paid in full, directly to the provider through Stripe. Gala Dock’s booking terms cover cancellations and problems." : "Your deposit confirms the booking and is paid to the provider through Stripe. Cancellations and refunds follow the booking’s agreed terms."} />}
      {isEvent && balanceDue > 0 && <PayButton kind="balance_payment" itemId={item.id} returnPath={back} label={`Pay balance ${money(balanceDue / 100)}`} amount={balanceDue / 100} />}
      {isEvent && openSb?.status === "accepted" && openSb.fee_status === "due" && <PayButton kind="standby_fee" standbyId={openSb.id} returnPath={back} label={`Pay standby fee ${money(openSb.standby_fee)}`} amount={Number(openSb.standby_fee)} />}
      {viewer === "provider" && payments.some(p => p.status === "protected_pending_delivery") && <p className="mk-note">Payment received in your Stripe account. Stripe pays it out on your payout schedule.</p>}
    </div>}

    {(openHold || (isEvent && holdable)) && <div className="mk-block">
      <h3><CalendarClock size={15} aria-hidden="true" />Conditional hold</h3>
      {openHold ? <>
        <p className="mk-line"><Tag tone="purple">{HOLD_LABEL[openHold.status]}</Tag>
          {openHold.status === "held" ? <span>Until {when(openHold.expires_at)}</span> : <span>Asked for {openHold.requested_hours}h · sent {when(openHold.created_at)}</span>}</p>
        {openHold.depends_on_item_id && <p className="mk-note">Depends on {siblings.find(s => s.id === openHold.depends_on_item_id)?.title ?? "another booking"} —{" "}
          {openHold.dependency_state === "met" ? "confirmed, ready to proceed." : openHold.dependency_state === "failed" ? "that booking fell through." : "awaiting confirmation."}</p>}
        {openHold.conditions && <p className="mk-note">Conditions: {openHold.conditions}</p>}
        {openHold.provider_note && <p className="mk-note">Provider: {openHold.provider_note}</p>}
        <div className="mk-row">
          {viewer === "provider" && openHold.status === "requested" && <HoldRespondForm holdId={openHold.id} requestedHours={openHold.requested_hours} />}
          <ActButton label="Release hold" action="releaseHold" args={openHold.id} reason="Reason" />
        </div>
      </> : <HoldRequestForm itemId={item.id} siblings={others} />}
      {holds.filter(h => h !== openHold).slice(0, 2).map(h => <p key={h.id} className="mk-history">{HOLD_LABEL[h.status]} · {when(h.created_at)}</p>)}
    </div>}

    {(standby.length > 0 || (isEvent && item.listing_id && ["available", "quoted", "quote_received", "standby"].includes(item.status))) && <div className="mk-block">
      <h3><LifeBuoy size={15} aria-hidden="true" />Paid standby</h3>
      {openSb ? <>
        <p className="mk-line"><Tag tone="purple">{SB_LABEL[openSb.status]}</Tag><span>Window {when(openSb.window_start)} – {when(openSb.window_end)}</span></p>
        {openSb.primary_item_id && <p className="mk-note">Covering {siblings.find(s => s.id === openSb.primary_item_id)?.title ?? "a primary booking"}.</p>}
        {openSb.status !== "requested" && <dl className="mk-dl"><div><dt>Standby fee</dt><dd>{money(openSb.standby_fee)}</dd></div><div><dt>Activation price</dt><dd>{money(openSb.activation_price)}</dd></div>
          {openSb.status === "accepted" && <div><dt>Fee</dt><dd>{openSb.fee_status === "due" ? "Due" : openSb.fee_status === "paid" ? "Paid" : "Not required"}</dd></div>}</dl>}
        {openSb.cancellation_terms && openSb.status !== "requested" && <p className="mk-note">Terms: {openSb.cancellation_terms}</p>}
        {openSb.status === "offered" && openSb.expires_at && <p className="mk-note">Offer valid until {when(openSb.expires_at)}.</p>}
        <div className="mk-row">
          {viewer === "provider" && openSb.status === "requested" && <StandbyOfferForm standbyId={openSb.id} />}
          {isEvent && openSb.status === "offered" && <ActButton label="Accept standby offer" action="acceptStandby" args={openSb.id} tone="primary" confirm={`Accepting commits you to the ${money(openSb.standby_fee)} standby fee under the provider’s terms.`} />}
          {isEvent && openSb.status === "accepted" && openSb.fee_status !== "due" && Date.parse(openSb.window_end) > now &&
            <ActButton label="Activate standby" action="activateStandby" args={openSb.id} tone="primary" reason="Why are you activating?" confirm={`This books the provider at ${money(openSb.activation_price)}.`} />}
          {isEvent && openSb.status === "accepted" && openSb.fee_status === "due" && <p className="mk-note warn">Pay the standby fee to make the commitment active. The provider is notified when it’s paid.</p>}
          {isEvent && <ActButton label={openSb.status === "accepted" ? "Release standby" : "Withdraw request"} action="releaseStandby" args={openSb.id} confirm={openSb.status === "accepted" ? "The provider’s standby terms apply to the fee." : undefined} />}
        </div>
      </> : isEvent && item.status !== "confirmed" ? <StandbyRequestForm itemId={item.id} siblings={others} eventStart={event.starts_at} /> : null}
      {standby.filter(s => s !== openSb).slice(0, 2).map(s => <p key={s.id} className="mk-history">{SB_LABEL[s.status]}{s.activated_at ? ` · ${when(s.activated_at)}` : ""}</p>)}
    </div>}

    {(openCancel || cancellable || cancellations.length > 0) && <div className="mk-block" id="cancel">
      <h3><Undo2 size={15} aria-hidden="true" />Cancellation</h3>
      {openCancel ? <>
        <p className="mk-line"><Tag tone="orange">{openCancel.status === "manual_review" ? "With Gala Dock review" : "Awaiting response"}</Tag>
          <span>{openCancel.party === "provider" ? "Provider" : openCancel.party === "customer" ? "Organiser" : "Mutual"} · {openCancel.kind.replace("_", " ")} · {when(openCancel.created_at)}</span></p>
        <p className="mk-note">“{openCancel.reason}”</p>
        <dl className="mk-dl"><div><dt>Paid</dt><dd>{money(openCancel.calculation.paid)}</dd></div><div><dt>Refund</dt><dd>{openCancel.calculation.refund_amount == null ? "On review" : money(openCancel.calculation.refund_amount)}</dd></div></dl>
        {openCancel.status === "requested" && ((viewer === "provider") !== (openCancel.party === "provider")) && <div className="mk-row">
          <ActButton label="Agree" action="acceptCancellation" args={openCancel.id} tone="primary" reason="Note (optional)" />
          <ActButton label="Decline" action="rejectCancellation" args={openCancel.id} reason="Why not?" />
        </div>}
      </> : cancellable ? <CancelForm itemId={item.id} party={viewer === "provider" ? "provider" : "customer"} /> : null}
      {cancellations.filter(c => c !== openCancel).slice(0, 2).map(c => <p key={c.id} className="mk-history">{c.party} {c.kind.replace("_", " ")} · {c.status.replace("_", " ")}{c.calculation.refund_amount != null ? ` · refund ${money(c.calculation.refund_amount)}` : ""}</p>)}
    </div>}

    {eventDay && <div className="mk-block"><h3><MapPin size={15} aria-hidden="true" />Event day</h3><ProviderSelfCheckin itemId={item.id} status={(checkin as { status: string } | null)?.status ?? null} /></div>}
    {venue.node}

    {(openDispute || disputable || disputes.length > 0) && <div className="mk-block">
      <h3><ShieldAlert size={15} aria-hidden="true" />Disputes</h3>
      {disputes.map(d => <p key={d.id} className="mk-line"><Tag tone={d.status === "resolved" ? "green" : "red"}>{DISPUTE_STATUS[d.status] ?? d.status}</Tag>
        <Link href={`${DISPUTE_BASE[viewer]}/${d.id}`} className="mk-link">{d.reference} · {DISPUTE_REASONS.find(([k]) => k === d.reason)?.[1]}</Link></p>)}
      {!openDispute && disputable && <DisputeOpenForm itemId={item.id} reasons={DISPUTE_REASONS} base={DISPUTE_BASE[viewer]} />}
    </div>}
  </section>;
}
