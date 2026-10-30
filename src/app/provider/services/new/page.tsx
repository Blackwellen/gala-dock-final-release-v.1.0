import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleAlert } from "lucide-react";
import "@/styles/provider-wizard.css";
import "@/styles/provider-venue.css";
import "@/styles/provider-venue-setup.css";
import "@/styles/provider-service.css";
import { ActionButton } from "@/components/workspace/actions";
import { getProvider } from "@/lib/provider/context";
import { rows, isUuid } from "@/lib/workspace/db";
import { workspaceListings } from "@/lib/provider/queries";
import { publishListing } from "../../listings/actions";
import { PhotoManager } from "../../venues/_components/photo-manager";
import { SvcStep1, SvcStep2, SvcStep3, type Svc, type Pkg } from "./steps";
import { ManagerOnly } from "../../_manager-only";

export const metadata: Metadata = { title: "Add service" };
const STEPS = ["Service & Coverage", "Pricing & Packages", "Availability & Requirements", "Media & Details", "Review & Publish"];
const SUB = ["Create your supplier marketplace offer.", "Define pricing, packages and customer requirements.", "Set availability, response rules and publish your service.", "Add photos and video that show your work.", "Check everything, then publish your service."];

export default async function AddService(props: PageProps<"/provider/services/new">) {
  const sp = await props.searchParams;
  const id = typeof sp.service === "string" ? sp.service : null;
  if (id && !isUuid(id)) notFound();
  const [ctx, listings] = await Promise.all([getProvider(), workspaceListings()]);
  if (!ctx.can.manage) return <ManagerOnly title="Add Service" back={{ href: "/provider/listings/services", label: "Back to Services" }} />;
  const s = id ? listings.find(l => l.id === id && l.kind === "service") ?? null : null;
  if (id && !s) notFound();
  const step = s ? Math.min(5, Math.max(1, Number(sp.step) || 1)) : 1;
  const url = (n: number) => `/provider/services/new?service=${s?.id ?? ""}&step=${n}`;
  const svc = ((s?.details as { service?: Svc } | undefined)?.service ?? {}) as Svc;
  const pkgs = s ? await rows<Pkg>(ctx.db.from("packages").select("id,name,description,base_price,image,duration_hours,status").eq("listing_id", s.id).order("base_price")) : [];
  const readiness = s ? ((await ctx.db.rpc("listing_readiness", { p_listing: s.id })).data ?? { missing: [] }) as { missing: string[] } : { missing: [] as string[] };
  const verify: [string, string, boolean][] = [["Identity verification", readiness.missing.includes("verification") ? "Pending" : "Verified", !readiness.missing.includes("verification")],
    ["Payout account", readiness.missing.includes("payouts") ? "Not connected" : "Connected", !readiness.missing.includes("payouts")],
    ["Insurance (public liability)", (svc.credentials ?? []).some(c => c.name.startsWith("Public liability") && c.reference) ? "Added" : "Missing", (svc.credentials ?? []).some(c => c.name.startsWith("Public liability") && c.reference)],
    ["Photos", s && [s.image, ...(s.gallery ?? [])].filter(Boolean).length ? "Added" : "Missing", !readiness.missing.includes("listing_photo")]];
  const editing = !!s?.published;

  return <div className="wz vwz">
    <Link href={step === 1 ? (s ? `/provider/services/${s.id}` : "/provider/listings/services") : url(step - 1)} className="ws-back wz-back"><ArrowLeft aria-hidden="true" />{step === 1 ? (s ? `Back to ${s.name}` : "Back to Services") : "Back to Add Service"}</Link>
    <header className="wz-head"><h1>{editing ? `Edit ${s!.name}` : "Add Service"}</h1><p>{SUB[step - 1]}</p></header>
    <ol className="wz-steps">{STEPS.map((t, i) => <li key={t} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
      {s && i + 1 !== step ? <Link href={url(i + 1)}><span>{i + 1 < step ? <Check aria-hidden="true" /> : i + 1}</span>{t}</Link> : <><span>{i + 1}</span>{t}</>}</li>)}</ol>
    {step === 1 && <SvcStep1 s={s} svc={svc} next={s ? url(2) : "/provider/services/new?service={service}&step=2"} />}
    {step === 2 && s && <SvcStep2 s={s} svc={svc} pkgs={pkgs} back={url(1)} next={url(3)} />}
    {step === 3 && s && <SvcStep3 s={s} svc={svc} back={url(2)} next={url(4)} verify={verify} />}
    {step === 4 && s && <div className="vw vw-s5"><PhotoManager venueId={s.id} initial={[s.image, ...(s.gallery ?? [])].filter(Boolean)} />
      <div className="vw-foot"><Link href={url(3)} className="ws-btn outline"><ArrowLeft aria-hidden="true" />Back</Link><span className="ws-spacer" /><span className="vw-stepof">Step 4 of 5</span>
        <Link href={url(5)} className="ws-btn primary">Next: Review &amp; Publish<ArrowRight aria-hidden="true" /></Link></div></div>}
    {step === 5 && s && <div className="vw vw-s6">
      <section className="ws-panel"><h2>Readiness</h2><ul className="vw-review">{verify.map(([l, v, ok]) => <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span><span>{v}</span></li>)}
        {([["Pricing configured", !!s.price_from || svc.pricing?.model === "quote", 2], ["Availability set", !!svc.availability, 3], ["Event types chosen", (svc.event_types ?? []).length > 0, 1]] as const).map(([l, ok, n]) =>
          <li key={l}>{ok ? <CircleCheck aria-hidden="true" className="ok" /> : <CircleAlert aria-hidden="true" className="warn" />}<span>{l}</span>{!ok ? <Link className="ws-link" href={url(n)}>Fix</Link> : <span />}</li>)}</ul></section>
      <section className="ws-panel"><h2>{s.published ? "Live on the marketplace" : "Publish"}</h2>
        <p>{s.published ? "This service is live. Changes apply immediately; accepted bookings keep their agreed terms." : "Publishing runs the platform’s readiness checks. If anything is missing it stays a draft and we’ll tell you what to add."}</p>
        <div className="ps-pub">{!s.published && <ActionButton variant="primary" action={publishListing} args={[s.id]}>Publish service</ActionButton>}<Link href={`/provider/services/${s.id}`} className="ws-btn outline">{s.published ? "Open service" : "Keep as draft & open"}</Link></div></section>
    </div>}
  </div>;
}
