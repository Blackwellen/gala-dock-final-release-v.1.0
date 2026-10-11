import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleAlert } from "lucide-react";
import "@/styles/provider-wizard.css";
import "@/styles/provider-venue.css";
import "@/styles/provider-space.css";
import "@/styles/provider-venue-setup.css";
import { ActionButton } from "@/components/workspace/actions";
import { getProvider } from "@/lib/provider/context";
import { rows, one, isUuid } from "@/lib/workspace/db";
import { workspaceListings } from "@/lib/provider/queries";
import { publishListing } from "../../listings/actions";
import { SpacesEditor } from "../_components/spaces-editor";
import { PhotoManager } from "../_components/photo-manager";
import type { MapEl } from "../_components/venue-map";
import { StepIdentity, StepCommercial, StepOperations } from "./steps";

export const metadata: Metadata = { title: "Add venue" };
const STEPS = ["Identity & Location", "Spaces & Map", "Commercial & Booking Rules", "Operations", "Media & Details", "Review & Publish"];
const SUB = ["Create your venue asset and get it ready for the marketplace.", "Create your spaces, set capacities and add a map of your venue.", "Set your pricing, deposits and booking rules.",
  "Set your operational details, compliance and get ready to publish.", "Add photos that show your venue at its best.", "Check everything, then publish your venue."];
const MISSING: Record<string, string> = { listing_name: "Venue name", listing_description: "Description (40+ characters)", listing_location: "Address", listing_photo: "At least one photo",
  workspace_setup: "Workspace setup", verification: "Identity verification", payouts: "Payout account connected" };

export default async function AddVenue(props: PageProps<"/provider/venues/new">) {
  const sp = await props.searchParams;
  const venueId = typeof sp.venue === "string" ? sp.venue : null;
  if (venueId && !isUuid(venueId)) notFound();
  const [ctx, listings] = await Promise.all([getProvider(), workspaceListings()]);
  const venue = venueId ? listings.find(l => l.id === venueId && l.kind === "venue") ?? null : null;
  if (venueId && !venue) notFound();
  const step = venue ? Math.min(6, Math.max(1, Number(sp.step) || 1)) : 1;
  const url = (n: number) => `/provider/venues/new?venue=${venue?.id ?? ""}&step=${n}`;
  const editing = !!venue?.published;
  const fixHref = (l: string) => l.startsWith("Payout") ? "/provider/money" : url(l.startsWith("Venue") ? 1 : l.includes("space") ? 2 : l.startsWith("Pricing") ? 3 : l.startsWith("Photos") ? 5 : 4);

  const [spaces, structure, readinessRaw] = venue ? await Promise.all([
    rows<{ id: string; name: string; status: string; indoor: boolean; image: string; capacity_standing: number | null; capacity_seated: number | null; rate_hourly: number | null; area_sqm: number | null;
      layouts: Record<string, number>; amenities: string[]; turnaround_minutes: number; min_hours: number; details: Record<string, unknown> }>(
      ctx.db.from("spaces").select("id,name,status,indoor,image,capacity_standing,capacity_seated,rate_hourly,area_sqm,layouts,amenities,turnaround_minutes,min_hours,details").eq("venue_id", venue.id).order("created_at", { ascending: false })),
    one<{ version: number; elements: MapEl[] }>(ctx.db.from("venue_structures").select("version,elements").eq("venue_id", venue.id).eq("status", "published").maybeSingle()),
    ctx.db.rpc("listing_readiness", { p_listing: venue.id }).then(r => (r.data ?? { missing: [] }) as { missing: string[]; eligible: boolean }),
  ]) : [[], null, { missing: [] as string[], eligible: false }];
  const d = (venue?.details ?? {}) as Record<string, unknown>;
  const com = d.commercial as { cancellation?: unknown[] } | undefined;
  const readiness: [string, boolean][] = venue ? [
    ["Venue details complete", !readinessRaw.missing.some(m => ["listing_name", "listing_description", "listing_location"].includes(m))],
    ["At least one space with capacity", spaces.some(s => Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0) > 0)],
    ["Pricing and booking rules configured", !!(venue.price_from || (d.commercial as { pricing?: string } | undefined)?.pricing === "quote") && !!com?.cancellation?.length],
    ["Access and operational information added", !!d.operations],
    ["Required licences and compliance documents", ((d.compliance as unknown[]) ?? []).length >= 2],
    ["Payout account connected", !readinessRaw.missing.includes("payouts")],
    ["Photos added (minimum 3)", [venue.image, ...(venue.gallery ?? [])].filter(Boolean).length >= 3],
  ] : [];
  const geo = (d.geo as { lat: number; lng: number } | null | undefined) ?? (venue?.lat != null && venue?.lng != null ? { lat: Number(venue.lat), lng: Number(venue.lng) } : null);

  return <div className="wz vwz">
    <Link href={step === 1 ? (venue ? `/provider/venues/${venue.id}` : "/provider/listings/venues") : url(step - 1)} className="ws-back wz-back"><ArrowLeft aria-hidden="true" />{step === 1 ? (venue ? `Back to ${venue.name}` : "Back to Venues") : "Back to Add Venue"}</Link>
    <header className="wz-head"><h1>{editing ? `Edit ${venue!.name}` : "Add Venue"}</h1><p>{SUB[step - 1]}</p></header>
    <ol className="wz-steps">{STEPS.map((t, i) => <li key={t} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
      {venue && i + 1 !== step ? <Link href={url(i + 1)}><span>{i + 1 < step ? <Check aria-hidden="true" /> : i + 1}</span>{t}</Link> : <><span>{i + 1}</span>{t}</>}</li>)}</ol>

    {step === 1 && <StepIdentity venue={venue} next={venue ? url(2) : "/provider/venues/new?venue={venue}&step=2"} />}
    {step === 2 && venue && <SpacesEditor venueId={venue.id} version={structure?.version ?? 0} elements={structure?.elements ?? []} geo={geo}
      spaces={spaces.map(s => ({ id: s.id, name: s.name, status: s.status, indoor: s.indoor, image: s.image, capacity_standing: s.capacity_standing, capacity_seated: s.capacity_seated, rate_hourly: s.rate_hourly,
        area_sqm: s.area_sqm, layouts: s.layouts ?? {}, amenities: s.amenities ?? [], turnaround_minutes: s.turnaround_minutes, min_hours: Number(s.min_hours), description: String(s.details?.description ?? "") }))}
      footer={<div className="vw-foot se-foot"><Link href={url(1)} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link><span className="ws-spacer" /><span className="vw-stepof">Step 2 of 6</span>
        <Link href={url(3)} className="ws-btn primary">Next: Commercial &amp; Booking Rules<ArrowRight aria-hidden="true" /></Link></div>} />}
    {step === 3 && venue && <StepCommercial venue={venue} back={url(2)} next={url(4)} />}
    {step === 4 && venue && <StepOperations venue={venue} back={url(3)} next={url(5)} photosHref={url(5)} readiness={readiness} photos={[venue.image, ...(venue.gallery ?? [])].filter(Boolean)}
      spaces={spaces.length} standing={spaces.reduce((n, x) => n + (x.capacity_standing ?? 0), 0)} />}
    {step === 5 && venue && <div className="vw vw-s5"><PhotoManager venueId={venue.id} initial={[venue.image, ...(venue.gallery ?? [])].filter(Boolean)} />
      <div className="vw-foot"><Link href={url(4)} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link><span className="ws-spacer" /><span className="vw-stepof">Step 5 of 6</span>
        <Link href={url(6)} className="ws-btn primary">Next: Review &amp; Publish<ArrowRight aria-hidden="true" /></Link></div></div>}
    {step === 6 && venue && <div className="vw vw-s6">
      <section className="ws-panel"><h2>Readiness</h2><ul className="vw-review">{readiness.map(([l, ok]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span>
        {!ok && <Link className="ws-link" href={fixHref(l)}>Fix</Link>}</li>)}</ul>
        {readinessRaw.missing.filter(m => !["listing_name", "listing_description", "listing_location", "payouts"].includes(m)).map(m => <p key={m} className="vw-block"><CircleAlert aria-hidden="true" />Publishing also needs: {MISSING[m] ?? m}</p>)}</section>
      <section className="ws-panel"><h2>{venue.published ? "Live on the marketplace" : "Publish"}</h2>
        <p>{venue.published ? "This venue is live. Changes you save apply immediately; accepted bookings keep their agreed terms." : "Publishing runs the platform’s readiness checks. If anything is missing it stays a draft and we’ll tell you what to add."}</p>
        <div className="ps-pub">{!venue.published && <ActionButton variant="primary" action={publishListing} args={[venue.id]}>Publish venue</ActionButton>}
          <Link href={`/provider/venues/${venue.id}`} className="ws-btn outline">{venue.published ? "Open venue" : "Keep as draft & open venue"}</Link></div></section>
    </div>}
  </div>;
}
