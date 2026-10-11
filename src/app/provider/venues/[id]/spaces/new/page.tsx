import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleAlert } from "lucide-react";
import "@/styles/provider-wizard.css";
import "@/styles/provider-space.css";
import { ActionForm, ActionButton } from "@/components/workspace/actions";
import { money } from "@/lib/workspace/format";
import { loadSpaceContext, buildRulesInput } from "../data";
import { saveSpaceSection } from "../actions";
import { setSpaceStatus } from "../../../../listings/actions";
import { SpaceBasicsForm } from "../../../_components/space-basics";
import { SpaceRulesForm } from "../../../_components/space-rules";
import { LAYOUT_LABEL } from "../../../_components/layout-glyph";

export const metadata: Metadata = { title: "Add space" };
const STEPS = ["Space & Layouts", "Features & Amenities", "Access & Operations", "Pricing & Availability", "Review & Publish"];
const SUB = ["Define your room or space and its layouts.", "Add the amenities, AV and accessibility guests can rely on.", "Tell organisers how access, facilities and operations work.",
  "Set availability and commercial rules for this space.", "Check everything, then publish or keep it as a draft."];
const AMENITIES = ["Stage", "PA system", "Lighting rig", "Bar", "Dance floor", "Wi-Fi", "Air conditioning", "Heating", "Natural light", "Blackout", "Cloakroom", "Green room", "Power distribution", "Kitchen access"];
const AV = ["Projector", "Screens", "Microphones", "Speakers", "LED wall", "Livestream kit", "Hearing loop"];

export default async function AddSpace(props: PageProps<"/provider/venues/[id]/spaces/new">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const spaceId = typeof sp.space === "string" ? sp.space : null;
  const c = await loadSpaceContext(id, spaceId);
  if (!c) notFound();
  const s = c.space;
  const step = s ? Math.min(5, Math.max(1, Number(sp.step) || 1)) : 1;
  const url = (n: number) => `/provider/venues/${id}/spaces/new?step=${n}${s ? `&space=${s.id}` : ""}`;
  const d = s?.details ?? {};

  return <div className="wz ps-wz">
    <Link href={step === 1 ? `/provider/venues/${id}?tab=spaces` : url(step - 1)} className="ws-back wz-back"><ArrowLeft aria-hidden="true" />{step === 1 ? "Back to Spaces" : "Back"}</Link>
    <header className="wz-head"><h1>{s && step > 1 ? `Add Space · ${s.name}` : "Add Space"}</h1><p>{SUB[step - 1]}</p></header>
    <ol className="wz-steps">{STEPS.map((t, i) => <li key={t} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
      {i + 1 < step ? <Link href={url(i + 1)}><span><Check aria-hidden="true" /></span>{t}</Link> : <><span>{i + 1}</span>{t}</>}</li>)}</ol>

    {step === 1 && <SpaceBasicsForm venueId={id} next={`/provider/venues/${id}/spaces/new?step=2&space={space}`} submitLabel="Next: Features & Amenities"
      initial={s ? { id: s.id, name: s.name, indoor: s.indoor, area_sqm: s.area_sqm, capacity_standing: s.capacity_standing, layouts: s.layouts, details: d }
        : { id: null, name: "", indoor: true, area_sqm: null, capacity_standing: null, layouts: { standing: 0 }, details: { use_cases: [], layout_features: [] } }} />}

    {step === 2 && s && <ActionForm action={saveSpaceSection.bind(null, id, s.id, "features", url(3))} className="ps-form">
      <section className="ws-panel"><h2>Amenities</h2><p>What’s included with this space.</p>
        <div className="ps-checks">{[...new Set([...AMENITIES, ...s.amenities])].map(a => <label key={a}><input type="checkbox" name="amenities" value={a} defaultChecked={s.amenities.includes(a)} />{a}</label>)}</div>
        <label className="ps-custom">Other amenities <small>Comma separated</small><input name="amenities_custom" placeholder="e.g. Piano, Rooftop access" /></label></section>
      <section className="ws-panel"><h2>Audio-visual</h2><p>Built-in AV available to organisers.</p>
        <div className="ps-checks">{[...new Set([...AV, ...(d.av ?? [])])].map(a => <label key={a}><input type="checkbox" name="av" value={a} defaultChecked={(d.av ?? []).includes(a)} />{a}</label>)}</div>
        <label className="ps-custom">Other AV <small>Comma separated</small><input name="av_custom" /></label></section>
      <section className="ws-panel"><h2>Accessibility</h2><p>Describe step-free access, accessible toilets and assistive facilities.</p>
        <label className="ps-custom">Accessibility<input name="accessibility" defaultValue={d.accessibility ?? ""} maxLength={200} placeholder="e.g. Fully accessible — step-free from the main entrance" /></label></section>
      <div className="sb-foot"><Link href={url(1)} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link><span className="ws-spacer" />
        <button type="submit" className="ws-btn primary">Next: Access &amp; Operations<ArrowRight aria-hidden="true" /></button></div>
    </ActionForm>}

    {step === 3 && s && <ActionForm action={saveSpaceSection.bind(null, id, s.id, "access", url(4))} className="ps-form">
      <section className="ws-panel ps-grid"><h2>Access &amp; operations</h2><p>Shown to organisers on the space profile and in booking confirmations.</p>
        <label>Access<input name="access" defaultValue={d.access ?? ""} maxLength={200} placeholder="e.g. Ground floor, direct loading access" /></label>
        <label>Toilets<input name="toilets" defaultValue={d.toilets ?? ""} maxLength={200} placeholder="e.g. Yes (adjacent)" /></label>
        <label>Bar<input name="bar" defaultValue={d.bar ?? ""} maxLength={200} placeholder="e.g. Attached bar (optional)" /></label>
        <label>Catering<input name="catering" defaultValue={d.catering ?? ""} maxLength={200} placeholder="e.g. In-house or external suppliers" /></label>
        <label>Parking<input name="parking" defaultValue={d.parking ?? ""} maxLength={200} placeholder="Leave blank to use the venue’s parking" /></label>
        <label>Curfew<input name="curfew" type="time" defaultValue={d.curfew ?? ""} /></label></section>
      <div className="sb-foot"><Link href={url(2)} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link><span className="ws-spacer" />
        <button type="submit" className="ws-btn primary">Next: Pricing &amp; Availability<ArrowRight aria-hidden="true" /></button></div>
    </ActionForm>}

    {step === 4 && s && <SpaceRulesForm venueId={id} input={buildRulesInput(c, s)} back={url(3)} next={url(5)} nextLabel="Next: Review & Publish" />}

    {step === 5 && s && (() => {
      const cap = Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0);
      const checks: [string, boolean, string][] = [["Name & type", !!s.name && !!d.space_type, d.space_type ?? "Add a space type"], ["Capacity", cap > 0, cap ? `${cap} max` : "Add a capacity"],
        ["Layouts", Object.keys(s.layouts).length > 0, Object.entries(s.layouts).map(([k, v]) => `${LAYOUT_LABEL[k] ?? k} ${v}`).join(", ") || "Add a layout"],
        ["Pricing", s.rate_hourly !== null, s.rate_hourly !== null ? `${money(s.rate_hourly)}/hr, min ${s.min_hours}h` : "Set a rate"], ["Photo", !!s.image, s.image ? "Added" : "Optional — add one to stand out"],
        ["Turnaround", s.turnaround_minutes > 0, `${s.turnaround_minutes} minutes between bookings`]];
      const ready = checks.filter(([l]) => l !== "Photo").every(([, ok]) => ok) && d.booking_type !== "operational";
      return <div className="ps-review">
        <section className="ws-panel"><h2>Review</h2><ul>{checks.map(([l, ok, v]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<b>{l}</b><span>{v}</span></li>)}</ul></section>
        <section className="ws-panel"><h2>Publish</h2><p>{d.booking_type === "operational" ? "This space is operational-only, so it stays off the marketplace." : s.status === "published" ? "This space is live on the marketplace." : "Publishing makes this space bookable on the marketplace."}</p>
          <div className="ps-pub">{s.status !== "published" && ready && <ActionButton variant="primary" action={setSpaceStatus} args={[id, s.id, "published"]}>Publish space</ActionButton>}
            <Link href={`/provider/venues/${id}/spaces/${s.id}`} className="ws-btn outline">{s.status === "published" ? "Open space" : "Keep as draft & open"}</Link></div></section>
      </div>;
    })()}
  </div>;
}
