import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleAlert } from "lucide-react";
import "@/styles/provider-wizard.css";
import "@/styles/provider-venue.css";
import "@/styles/provider-venue-setup.css";
import "@/styles/provider-space.css";
import "@/styles/provider-service.css";
import "@/styles/provider-package.css";
import { ActionButton } from "@/components/workspace/actions";
import { isUuid } from "@/lib/workspace/db";
import { PhotoManager } from "../../venues/_components/photo-manager";
import { savePackagePhotos, setPackageLive } from "../actions";
import { loadPackageContext } from "../data";
import { PkgStep1, PkgStep2, PkgStep3 } from "./steps";

export const metadata: Metadata = { title: "Create package" };
const STEPS = ["Offer Details", "Pricing, Rules & Publish", "Availability & Rules", "Media & Details", "Review & Publish"];
const SUB = ["Bundle your venue and services into a reusable offer.", "Set pricing, availability, booking rules and publish.", "Fine-tune the dates this package can be booked.", "Add photos that sell the experience.", "Check everything, then publish your package."];

export default async function CreatePackage(props: PageProps<"/provider/packages/new">) {
  const sp = await props.searchParams;
  const id = typeof sp.package === "string" ? sp.package : null;
  const preset = typeof sp.listing === "string" && isUuid(sp.listing) ? sp.listing : null;
  const c = await loadPackageContext(id);
  if (!c) notFound();
  const { pkg: p, parent, listings, options, days } = c;
  const step = p ? Math.min(5, Math.max(1, Number(sp.step) || 1)) : 1;
  const url = (n: number) => `/provider/packages/new?package=${p?.id ?? ""}&step=${n}`;
  const photos = p ? [p.image, ...(p.details.gallery ?? [])].filter(Boolean) : [];
  const checks: [string, boolean, number][] = p ? [["Name, description and parent", p.description.length >= 20, 1], ["At least one inclusion", (p.details.items ?? []).length > 0, 1], ["Price set (or quote only)", Number(p.base_price) > 0 || p.details.pricing?.model === "quote", 2],
    ["Guest range", !!p.max_guests, 1], ["At least one photo", photos.length > 0, 4]] : [];
  const ready = checks.every(([, ok]) => ok);
  return <div className="wz vwz">
    <Link href={step === 1 ? (p ? `/provider/packages/${p.id}` : "/provider/listings/packages") : url(step - 1)} className="ws-back wz-back"><ArrowLeft aria-hidden="true" />{step === 1 ? (p ? `Back to ${p.name}` : "Back to Packages") : "Back to Create Package"}</Link>
    <header className="wz-head"><h1>{p?.status === "published" ? `Edit ${p.name}` : "Create Package"}</h1><p>{SUB[step - 1]}</p></header>
    <ol className="wz-steps">{STEPS.map((t, i) => <li key={t} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
      {p && i + 1 !== step ? <Link href={url(i + 1)}><span>{i + 1 < step ? <Check aria-hidden="true" /> : i + 1}</span>{t}</Link> : <><span>{i + 1}</span>{t}</>}</li>)}</ol>
    {step === 1 && <PkgStep1 p={p} parent={parent} listings={listings} options={options} presetListing={preset} next={p ? url(2) : "/provider/packages/new?package={package}&step=2"} />}
    {step === 2 && p && <PkgStep2 p={p} parent={parent} days={days} back={url(1)} next={url(3)} />}
    {step === 3 && p && <PkgStep3 p={p} days={days} back={url(2)} next={url(4)} />}
    {step === 4 && p && <div className="vw vw-s5"><PhotoManager venueId={p.id} initial={photos} save={savePackagePhotos.bind(null, p.id)} />
      <div className="vw-foot"><Link href={url(3)} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link><span className="ws-spacer" /><span className="vw-stepof">Step 4 of 5</span>
        <Link href={url(5)} className="ws-btn primary">Next: Review &amp; Publish<ArrowRight aria-hidden="true" /></Link></div></div>}
    {step === 5 && p && <div className="vw vw-s6">
      <section className="ws-panel"><h2>Readiness</h2><ul className="vw-review">{checks.map(([l, ok, n]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span>{!ok ? <Link className="ws-link" href={url(n)}>Fix</Link> : <span />}</li>)}</ul></section>
      <section className="ws-panel"><h2>{p.status === "published" ? "Live on the marketplace" : "Publish"}</h2>
        <p>{p.status === "published" ? "This package is live. Price changes never alter accepted bookings." : ready ? "Everything required is in place." : "Finish the items on the left first — publishing also requires a price above £0."}</p>
        <div className="ps-pub">{p.status !== "published" && <ActionButton variant="primary" action={setPackageLive} args={[p.id, true]} disabled={!ready}>Publish package</ActionButton>}
          <Link href={`/provider/packages/${p.id}`} className="ws-btn outline">{p.status === "published" ? "Open package" : "Keep as draft & open"}</Link></div></section></div>}
  </div>;
}
