import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import "@/styles/provider-wizard.css";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceJobs, workspaceListings, workspaceSpaces, startOfDay } from "@/lib/provider/queries";
import { workspaceBlocks } from "@/lib/provider/commercial";
import { readDraft, POLICIES } from "./draft";
import { StepEvent, StepSpace, StepPricing } from "./steps";

export const metadata: Metadata = { title: "Create venue booking" };
const STEPS = ["Event & Client", "Space & Package", "Pricing & Terms", "Review & Create"];
const SUB = ["Add the event details and client information to create a new booking.", "Select the space(s), layout and package for this event.", "Set the commercial terms and confirm the booking."];

/** London wall-clock → epoch ms. */
function londonMs(date: string, time: string, addDays = 0) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d + addDays, hh, mm);
  const tz = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" }).formatToParts(new Date(guess)).find(p => p.type === "timeZoneName")?.value ?? "GMT";
  return guess - Number(tz.match(/GMT([+-]\d+)/)?.[1] ?? 0) * 36e5;
}

export default async function NewBooking(props: PageProps<"/provider/bookings/new">) {
  const sp = await props.searchParams;
  const draft = await readDraft();
  const requested = Number(sp.step) || 1;
  // Steps can't be skipped: later steps need the earlier ones saved.
  const step = requested >= 3 && draft.spaceId ? 3 : requested >= 2 && draft.eventName && draft.date ? 2 : 1;
  const [ctx, listings, spaces, jobs, blocks] = await Promise.all([getProvider(), workspaceListings(), workspaceSpaces(), workspaceJobs(), workspaceBlocks()]);
  const venues = listings.filter(l => l.kind === "venue");
  const venue = venues.find(v => v.id === draft.venueId) ?? venues[0];
  const venueSpaces = spaces.filter(s => s.venue_id === venue?.id);
  const packages = await rows<{ id: string; name: string; description: string; base_price: number; price_basis: string; inclusions: string[]; space_ids: string[]; listing_id: string; min_guests: number | null; max_guests: number | null }>(
    ctx.db.from("packages").select("id,name,description,base_price,price_basis,inclusions,space_ids,listing_id,min_guests,max_guests").eq("workspace_id", ctx.workspace.id).eq("status", "published"));
  const services = listings.filter(l => l.kind === "service" && l.price_from);

  // Availability for the requested date/time across this venue's spaces.
  const day = draft.date ? startOfDay(0, londonMs(draft.date, "12:00")) : null;
  const reqStart = draft.date && draft.start ? londonMs(draft.date, draft.start) : null;
  const reqEnd = draft.date && draft.end && draft.start ? londonMs(draft.date, draft.end, draft.end <= draft.start ? 1 : 0) : null;
  const busy = venueSpaces.map(s => {
    const segs = [
      ...jobs.filter(j => j.space_id === s.id && ["held", "confirmed", "active"].includes(j.status) && j.role === "primary").map(j => ({ a: new Date(j.starts_at).getTime(), b: new Date(j.ends_at).getTime(), label: j.event_name, kind: j.status === "held" ? "partial" : "booked" })),
      ...blocks.filter(b => b.space_id === s.id && ["blocked", "maintenance"].includes(b.kind)).map(b => ({ a: new Date(b.starts_at).getTime(), b: new Date(b.ends_at).getTime(), label: b.note || b.kind, kind: "booked" })),
    ].filter(x => day === null || (x.a < day + 2 * 864e5 && x.b > day));
    const conflict = reqStart !== null && reqEnd !== null ? segs.find(x => x.a < reqEnd && x.b > reqStart) ?? null : null;
    return { spaceId: s.id, segs, conflict };
  });
  const tax = ((ctx.workspace.settings as Record<string, Record<string, unknown>>)?.tax ?? {}) as { vat_registered?: boolean; rate_bps?: number };
  const taxBps = tax.vat_registered ? Number(tax.rate_bps ?? 0) : 0;
  const commercial = (venue?.details?.commercial ?? {}) as { rate_from?: number; minimum_spend?: number; deposit_pct?: number };

  return <div className="wz">
    <Link href={step === 1 ? "/provider/bookings" : `/provider/bookings/new?step=${step - 1}`} className="ws-back wz-back"><ArrowLeft aria-hidden="true" />{step === 1 ? "Back to Bookings" : "Back to Create Booking"}</Link>
    <header className="wz-head"><h1>Create Venue Booking</h1><p>{SUB[step - 1]}</p></header>
    <ol className="wz-steps">{STEPS.map((s, i) => <li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
      {i + 1 < step ? <Link href={`/provider/bookings/new?step=${i + 1}`}><span><Check aria-hidden="true" /></span>{s}</Link> : <><span>{i + 1}</span>{s}</>}</li>)}</ol>
    {step === 1 && <StepEvent draft={draft} venues={venues.map(v => ({ id: v.id, name: v.name, location: v.location, image: v.image, gallery: v.gallery ?? [], capacity: v.capacity_max, tags: v.tags ?? [], spaces: spaces.filter(s => s.venue_id === v.id).length }))} />}
    {step === 2 && venue && <StepSpace draft={draft} venue={{ id: venue.id, name: venue.name, location: venue.location, image: venue.image, capacity: venue.capacity_max, spaces: venueSpaces.length }}
      spaces={venueSpaces.map(s => ({ id: s.id, name: s.name, image: s.image, capacity: Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0), seated: s.capacity_seated, indoor: s.indoor, rate: s.rate_hourly }))}
      layouts={Object.fromEntries((await rows<{ id: string; layouts: Record<string, number> }>(ctx.db.from("spaces").select("id,layouts").in("id", venueSpaces.map(s => s.id).length ? venueSpaces.map(s => s.id) : ["00000000-0000-0000-0000-000000000000"]))).map(s => [s.id, s.layouts]))}
      packages={packages.filter(p => p.listing_id === venue.id)} busy={busy} dayStart={day} reqStart={reqStart} reqEnd={reqEnd} />}
    {step === 3 && venue && <StepPricing draft={draft} venue={{ id: venue.id, name: venue.name, image: venue.image }} space={venueSpaces.find(s => s.id === draft.spaceId) ?? null}
      packages={packages.filter(p => p.listing_id === venue.id)} services={services.map(s => ({ id: s.id, name: s.name, category: s.category, price: Number(s.price_from), unit: s.price_unit, image: s.image }))}
      taxBps={taxBps} defaults={{ hire: commercial.rate_from ?? Number(venueSpaces.find(s => s.id === draft.spaceId)?.rate_hourly ?? 0), minimumSpend: commercial.minimum_spend ?? 0, depositPct: commercial.deposit_pct ?? 25 }}
      policies={Object.fromEntries(Object.entries(POLICIES).map(([k, v]) => [k, v.label]))} conflict={busy.find(b => b.spaceId === draft.spaceId)?.conflict?.label ?? null} />}
  </div>;
}
