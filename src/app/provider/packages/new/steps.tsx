import Link from "next/link";
import { Sparkles, CircleCheck, Info, ArrowLeft, ArrowRight, Save, Building2, Wrench, Clock3, Users, Tag, MapPin, Zap, Mail, HelpCircle, Plus, Star } from "lucide-react";
import { VenuePreview } from "../../venues/new/preview";
import { ActionForm } from "@/components/workspace/actions";
import { money } from "@/lib/workspace/format";
import type { Listing } from "@/lib/provider/queries";
import { savePackageOffer, savePackagePricing, savePackageAvailability } from "../actions";
import { InclusionsEditor, AvailabilityCalendar, type DayState } from "../_components/editors";
import type { PackageRow } from "../data";

const FEATURES = ["Riverside location", "Professional sound & lighting", "Fully staffed bar", "Customisable to your theme", "Step-free access", "Dedicated coordinator"];
const EVENT_TYPES = ["Private Parties", "Weddings", "Corporate Events", "Birthdays", "Conferences", "Festivals", "Product Launches"];
const Toggle = ({ name, label, sub, on }: { name: string; label: string; sub?: string; on?: boolean }) =>
  <label className="vw-switch"><input type="checkbox" name={name} defaultChecked={!!on} /><i aria-hidden="true" /><span><b>{label}</b>{sub && <small>{sub}</small>}</span></label>;
const Foot = ({ back, next, step, label }: { back?: string; next: string; step: number; label?: string }) => <div className="vw-foot">
  {back && <Link href={back} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link>}
  {!label && <button type="submit" name="_draft" value="1" className="ws-btn outline"><Save aria-hidden="true" />Save as draft</button>}
  <span className="ws-spacer" />{!label && <span className="vw-stepof">Step {step} of 5</span>}<button type="submit" className="ws-btn primary">{label ?? next}<ArrowRight aria-hidden="true" /></button></div>;

export function PackagePreview({ p, parent }: { p: PackageRow | null; parent: Listing | null }) {
  const photos = p ? [p.image, ...(p.details.gallery ?? [])].filter(Boolean) : [];
  const live = !!(parent?.slug && p?.status === "published");
  const chips = [{ icon: <MapPin aria-hidden="true" />, label: parent ? `${parent.name}, ${parent.city || "London"}` : "Choose a venue or service" },
    ...(p?.details.event_type ? [{ icon: <Tag aria-hidden="true" />, label: p.details.event_type }] : [])];
  return <VenuePreview thumbsFirst className="pkw-preview" title="Package preview" editLabel="Change image" photos={photos} name={p?.name || "Your package"} chips={chips}
    editHref={p ? `/provider/packages/new?package=${p.id}&step=4` : "#"} publicHref={live ? `/${parent!.kind === "venue" ? "venues" : "services"}/${parent!.slug}` : null}
    nameExtra={parent && parent.review_count > 0 ? <span className="pkw-rating" title={`${parent.name} reviews`}><Star aria-hidden="true" />{parent.rating.toFixed(1)} <small>({parent.review_count})</small></span> : null}>
    {p?.description && <p className="pkw-desc">{p.description}</p>}
    <ul className="pkw-facts">{p?.duration_hours ? <li><Clock3 aria-hidden="true" />{p.duration_hours} hours</li> : null}{p?.max_guests ? <li><Users aria-hidden="true" />{p.min_guests ?? 1} – {p.max_guests} guests</li> : null}
      {p && Number(p.base_price) > 0 && <li><Tag aria-hidden="true" />From <b>{money(p.base_price)}</b></li>}{p?.booking_mode === "instant" && <li className="g"><Zap aria-hidden="true" />Instant book</li>}</ul>
  </VenuePreview>;
}

export function PkgStep1({ p, parent, listings, options, next, presetListing }: { p: PackageRow | null; parent: Listing | null; listings: Listing[]; options: Parameters<typeof InclusionsEditor>[0]["options"]; next: string; presetListing: string | null }) {
  const d = p?.details ?? {}, chosen = parent?.id ?? presetListing ?? listings.find(l => l.kind === "venue")?.id ?? listings[0]?.id;
  const addOns = p?.add_ons ?? [];
  return <div className="vw pkw-s1">
    <ActionForm action={savePackageOffer.bind(null, p?.id ?? null, next)} className="vw-contents">
      <section className="ws-panel pkw-parent"><h2>Parent selection</h2><p>Choose the venue or service this package is based on.</p>
        <label>Venue or service <i>*</i><select name="listing_id" className="ws-select" defaultValue={chosen}>
          <optgroup label="Venues">{listings.filter(l => l.kind === "venue").map(l => <option key={l.id} value={l.id}>{l.name} — {l.city || "London"}</option>)}</optgroup>
          <optgroup label="Services">{listings.filter(l => l.kind === "service").map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup></select></label>
        <p className="pkw-kinds"><span className={(listings.find(l => l.id === chosen)?.kind ?? "venue") === "venue" ? "on" : ""}><Building2 aria-hidden="true" />Venue package</span><span className={listings.find(l => l.id === chosen)?.kind === "service" ? "on" : ""}><Wrench aria-hidden="true" />Service package</span></p></section>
      <section className="ws-panel pkw-basic"><h2>Basic information</h2><p>Give your package a clear name and description.</p>
        <label>Package name <i>*</i><input name="name" defaultValue={p?.name ?? ""} required minLength={2} maxLength={100} /></label>
        <label>Short description <i>*</i><textarea name="description" rows={3} minLength={20} maxLength={500} required defaultValue={p?.description ?? ""} /></label></section>
      <section className="ws-panel pkw-incl"><h2>Inclusions</h2><p>Select the venues, services and extras included in this package.</p><InclusionsEditor initial={d.items ?? []} options={options} /></section>
      <section className="ws-panel pkw-event"><h2>Event details</h2><p>Set the core details for this package.</p>
        <div className="vw-grid2"><label>Event type<select name="event_type" className="ws-select" defaultValue={d.event_type ?? EVENT_TYPES[0]}>{EVENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label>Suitable for<select name="suitable_for" className="ws-select" defaultValue={d.suitable_for ?? "All ages"}><option>All ages</option><option>Adults (18+)</option><option>Families</option></select></label>
          <label>Duration<span className="vw-money"><input name="duration" type="number" min={1} max={48} step={0.5} defaultValue={p?.duration_hours ?? 4} /><em className="r">hours</em></span></label>
          <label>Guest capacity<span className="vw-dual"><input name="min_guests" type="number" min={1} defaultValue={p?.min_guests ?? ""} placeholder="Min" aria-label="Minimum guests" /><input name="max_guests" type="number" min={1} defaultValue={p?.max_guests ?? ""} placeholder="Max" aria-label="Maximum guests" /></span></label></div>
        <p className="vw-info"><Info aria-hidden="true" />Capacity can’t exceed the linked spaces’ safe limits — layouts are checked when the package is booked.</p></section>
      <section className="ws-panel pkw-addons"><h2>Optional add-ons</h2><p>Add optional extras to enhance this package.</p>
        <ul>{[0, 1, 2, 3].map(i => { const a = addOns[i]; return <li key={i}><input name={`addon_name_${i}`} defaultValue={a?.name ?? ""} placeholder={["Photo booth", "Decor & styling", "Extended bar", "Add-on"][i]} aria-label={`Add-on ${i + 1}`} />
          <input name={`addon_desc_${i}`} defaultValue={a?.desc ?? ""} placeholder="Detail" aria-label={`Add-on ${i + 1} detail`} /><span className="vw-money"><em>£</em><input name={`addon_price_${i}`} type="number" min={0} defaultValue={a?.price ?? ""} aria-label={`Add-on ${i + 1} price`} /></span>
          <label className="vw-switch"><input type="checkbox" name={`addon_on_${i}`} defaultChecked={a?.enabled ?? true} /><i aria-label="Offered" /></label></li>; })}</ul></section>
      <section className="ws-panel pkw-feat"><h2>Key features</h2><p>Highlight what makes this package special.</p>
        <div className="svw-checks pkw-checks">{[...new Set([...FEATURES, ...(d.features ?? [])])].map(f => <label key={f}><input type="checkbox" name="features" value={f} defaultChecked={(d.features ?? []).includes(f)} />{f}</label>)}</div>
        <label className="pkw-addfeat"><Plus aria-hidden="true" /><input name="feature_custom" placeholder="Add feature" maxLength={60} aria-label="Add feature" /></label></section>
      <div className="vw-foot pkw-foot"><button type="submit" name="_draft" value="1" className="ws-btn outline"><Save aria-hidden="true" />Save as draft</button><span className="ws-spacer" /><span className="vw-stepof">Step 1 of 5</span>
        <button type="submit" className="ws-btn primary">Continue to Pricing &amp; Add-ons<ArrowRight aria-hidden="true" /></button></div>
    </ActionForm>
    <aside className="vw-side pkw-side1">
      <section className="ws-panel vw-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Online</em></h2>
        <div className="sb-agent-box"><p>Packages that convert well usually:</p><ul>{["Include the space plus 2–4 services", "Set a clear duration (4–6 hours)", "Offer 2–3 optional add-ons", "Show a realistic guest range", "Highlight what’s unique about the venue"].map(i => <li key={i}><CircleCheck aria-hidden="true" />{i}</li>)}</ul>
          <Link href={`/provider/agent?goal=${encodeURIComponent(`Help me build ${p?.name ?? "a new package"}`)}`} className="ws-btn outline block sm">Ask Gala Agent</Link></div></section>
      <PackagePreview p={p} parent={parent} />
    </aside>
  </div>;
}

export function PkgStep2({ p, parent, days, back, next, label }: { p: PackageRow; parent: Listing | null; days: Record<string, DayState>; back?: string; next: string; label?: string }) {
  const d = p.details, r = d.restrictions ?? {}, model = d.pricing?.model ?? "fixed", canc = d.cancellation ?? [{ window: "More than 30 days", refund: 100 }, { window: "15 – 30 days", refund: 50 }, { window: "7 – 14 days", refund: 25 }, { window: "Less than 7 days", refund: 0 }];
  return <ActionForm action={savePackagePricing.bind(null, p.id, next)} className="vw pkw-s2">
    <div className="pkw-col pkw-col-a">
    <section className="ws-panel pkw-price"><h2>Pricing &amp; payment</h2><p>Set how this package is priced and how customers pay.</p>
      <div className="svw-models pkw-models">{([["fixed", "Fixed price", "One price for the full package"], ["from", "From price", "Show a starting price range."], ["quote", "Quote only", "No public price, customers must request a quote."]] as const).map(([k, l, sub]) =>
        <label key={k}><input type="radio" name="model" value={k} defaultChecked={model === k} /><span><b>{l}</b><small>{sub}</small></span></label>)}</div>
      <div className="pkw-pricerow"><label>Package price (GBP) <i>*</i><span className="vw-money"><em>£</em><input name="price" type="number" min={0} defaultValue={Number(p.base_price) || ""} /></span></label>
        <label>Basis<select name="basis" className="ws-select" defaultValue={p.price_basis}><option value="fixed">Per package</option><option value="per_person">Per person</option><option value="hourly">Per hour</option></select></label>
        <label>Deposit required <i>*</i><span className="vw-money"><input name="deposit" type="number" min={0} max={100} defaultValue={p.deposit_pct} /><em className="r">%</em></span></label>
        <span className="pkw-depamt">{Number(p.base_price) > 0 ? money((Number(p.base_price) * p.deposit_pct) / 100) : "—"}</span></div>
      <p className="vw-info"><Info aria-hidden="true" />Customers pay a {p.deposit_pct}% deposit{Number(p.base_price) > 0 ? ` (${money((Number(p.base_price) * p.deposit_pct) / 100)})` : ""} to confirm. The balance is due 14 days before the event by default.</p></section>
    <section className="ws-panel pkw-mode"><h2>Booking mode</h2><p>Choose how customers can book this package.</p>
      <div className="svw-bmodes">{([["instant", Zap, "Instant book", "Customers can book and pay immediately."], ["request", Mail, "Request to book", "Customers send a request, you approve."], ["enquiry", HelpCircle, "Enquiry only", "Customers can enquire, no booking or payment."]] as const).map(([k, I, l, sub]) =>
        <label key={k}><input type="radio" name="booking_mode" value={k} defaultChecked={p.booking_mode === k} /><span><b><I aria-hidden="true" /> {l}</b><small>{sub}</small></span></label>)}</div></section>
    <section className="ws-panel pkw-rules"><h2>Booking restrictions</h2><p>Set any rules or restrictions for this package.</p>
      <ul className="pkw-rlist">
        <li><Toggle name="x_min_notice" label="Minimum notice period" on={r.min_notice_days != null} /><span className="vw-money"><input name="min_notice" type="number" min={0} defaultValue={r.min_notice_days ?? 7} aria-label="Minimum notice" /><em className="r">days</em></span></li>
        <li><Toggle name="x_max_notice" label="Maximum notice period" on={r.max_notice_days != null} /><span className="vw-money"><input name="max_notice" type="number" min={0} defaultValue={r.max_notice_days ?? 365} aria-label="Maximum notice" /><em className="r">days</em></span></li>
        <li><Toggle name="x_min_guests" label="Minimum guest count" on={p.min_guests != null} /><input name="min_guests" type="number" min={1} defaultValue={p.min_guests ?? 50} aria-label="Minimum guests" /></li>
        <li><Toggle name="x_max_guests" label="Maximum guest count" on={p.max_guests != null} /><input name="max_guests" type="number" min={1} defaultValue={p.max_guests ?? 300} aria-label="Maximum guests" /></li>
        <li><Toggle name="x_age" label="Age restriction" on={!!r.age} /><select name="age" className="ws-select" defaultValue={r.age ?? "18+ only"} aria-label="Age restriction"><option>18+ only</option><option>21+ only</option><option>Under-18s with adults</option></select></li>
        <li><Toggle name="x_types" label="Restrict to specific event types" on={!!r.event_types} /><input name="types" defaultValue={r.event_types ?? ""} placeholder="e.g. Weddings, Parties" aria-label="Event types" /></li></ul></section>
    </div>
    <div className="pkw-col pkw-col-b">
    <section className="ws-panel pkw-avail"><h2>Availability</h2><p>When is this package available to book?</p><div className="pkw-availmode" role="group" aria-label="Availability source">
        <span className={(d.availability?.blocked ?? []).length ? "" : "on"}>Use {parent?.kind === "service" ? "service" : "venue"} availability</span>
        <Link href={`/provider/packages/new?package=${p.id}&step=3`} className={(d.availability?.blocked ?? []).length ? "on" : ""}>Set custom availability</Link></div>
      <AvailabilityCalendar days={days} blocked={d.availability?.blocked ?? []} side={<div className="pkw-calside"><Link href={`/provider/packages/new?package=${p.id}&step=3`} className="pkw-bulk">Bulk update</Link>
        <Link href={`/provider/packages/new?package=${p.id}&step=3`} className="ws-btn outline sm">Edit specific dates</Link></div>} /></section>
    <section className="ws-panel pkw-cancel"><h2>Cancellation policy</h2><p>Set your cancellation terms for this package.</p>
      <div className="vw-cancel-rows">{[0, 1, 2, 3].map(i => <div key={i}><input name={`c_window_${i}`} defaultValue={canc[i]?.window ?? ""} aria-label={`Window ${i + 1}`} /><span className="vw-money"><input name={`c_refund_${i}`} type="number" min={0} max={100} defaultValue={canc[i]?.refund ?? ""} aria-label={`Refund ${i + 1}`} /><em className="r">% refund</em></span></div>)}</div>
      <small className="vw-hint">Leave empty to use {parent?.kind === "service" ? "the service’s" : "the venue’s"} policy.</small></section>
    <section className="ws-panel pkw-holds"><h2>Hold, standby &amp; emergency</h2><p>Manage conditional holds and last-minute options.</p>
      <div className="svw-buffer"><Toggle name="holds" label="Allow conditional holds" on={d.holds?.enabled ?? true} /><select name="hold_hours" className="ws-select" defaultValue={d.holds?.hours ?? 24} aria-label="Hold length">{[24, 48, 72].map(h => <option key={h} value={h}>{h} hours</option>)}</select></div>
      <Toggle name="standby" label="Offer standby option" sub="Show in last-minute search (within 48 hours)." on={d.standby?.enabled} />
      <Toggle name="emergency" label="Allow emergency booking" sub="Customers can book with less than 48 hours’ notice." on={d.emergency?.enabled} /></section>
    </div>
    <aside className="vw-side pkw-side2"><section className="ws-panel vw-agent"><h2><span className="sb-agent-ic"><Sparkles aria-hidden="true" /></span>Gala Agent <em>Online</em></h2>
      <div className="sb-agent-box"><p>Checks on your pricing and rules:</p><ul>{[Number(p.base_price) > 0 ? `Price set: ${money(p.base_price)} ${p.price_basis === "per_person" ? "per person" : p.price_basis === "hourly" ? "per hour" : "per package"}` : "Set a price or choose Quote only",
        `Deposit set to ${p.deposit_pct}%${Number(p.base_price) > 0 ? ` (${money((Number(p.base_price) * p.deposit_pct) / 100)})` : ""}`,
        p.booking_mode === "instant" ? "Instant book needs accurate availability" : "Requests must be answered within your response window", "Cancellation terms shown before booking", "Availability follows the linked spaces",
        p.max_guests ? `Guest range ${p.min_guests ?? 1}–${p.max_guests} checked against space limits` : "Add a guest range"].map(i => <li key={i}><CircleCheck aria-hidden="true" />{i}</li>)}</ul>
        <Link href={`/provider/agent?goal=${encodeURIComponent(`Review pricing for ${p.name}`)}`} className="ws-btn outline block sm">Review with Gala Agent</Link></div></section>
      <PackagePreview p={p} parent={parent} /></aside>
    <Foot back={back} next="Next: Availability & Rules" step={2} label={label} />
  </ActionForm>;
}

export function PkgStep3({ p, days, back, next, label }: { p: PackageRow; days: Record<string, DayState>; back?: string; next: string; label?: string }) {
  return <ActionForm action={savePackageAvailability.bind(null, p.id, next)} className="vw pkw-s3">
    <section className="ws-panel"><h2>Availability</h2><p>Bookings and holds on the linked spaces are applied automatically. Block extra dates for this package below.</p>
      <div className="sr-seg pkw-src"><label><input type="radio" name="mode" value="inherit" defaultChecked={(p.details.availability?.mode ?? "inherit") === "inherit"} /><span>Use venue/service availability</span></label>
        <label><input type="radio" name="mode" value="custom" defaultChecked={p.details.availability?.mode === "custom"} /><span>Set custom availability</span></label></div>
      <AvailabilityCalendar days={days} blocked={p.details.availability?.blocked ?? []} editable months={3} /></section>
    <Foot back={back} next="Next: Media & Details" step={3} label={label} />
  </ActionForm>;
}
