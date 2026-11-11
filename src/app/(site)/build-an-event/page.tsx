import { ArrowRight, CalendarDays, CircleCheck, Clock3, Lock, ShieldCheck, Wallet, RefreshCcw } from "lucide-react";
import { HREF, pageMetadata } from "@/lib/public/site";
import { siteUrl } from "@/lib/site-url";
import { TLink } from "@/components/site/tracked-link";
import { Scope } from "@/components/site/motion";
import { cx, Eyebrow, JsonLd, SectionHead, vars } from "@/components/site/ui";
import { Backups, BuildCanvasSignature, BuildPreview, BuildToPlan, Dependencies, Emergency, EventTypes } from "@/components/site/build/demos";
import "@/styles/site-build.css";

export const metadata = pageMetadata({
  path: "/build-an-event",
  title: "Plan a party, wedding or celebration — venues and event suppliers in one plan",
  description: "Build an event around one plan: choose the date, find a venue, add catering, a DJ, a photographer and staff, book in the right order and keep the budget in view.",
});

const S = "build_an_event";
const MILESTONES: [string, string, string, "done" | "now" | "lock" | "next"][] = [
  ["6 weeks", "Venue", "Book the venue first — everything else depends on it.", "done"],
  ["4 weeks", "Entertainment", "Unlocks after the venue is confirmed.", "now"],
  ["2 weeks", "Final guests", "Confirm numbers for catering and staff.", "next"],
  ["7 days", "Reconfirm suppliers", "Arrival times and contacts checked.", "next"],
  ["48 hours", "Readiness check", "Anything missing is flagged in time.", "next"],
  ["Event day", "Enjoy it", "The run sheet is ready on your phone.", "next"],
];

export default function BuildAnEventPage() {
  const base = siteUrl();
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      { "@type": "Service", name: "Build an Event on Gala Dock", serviceType: "Event planning", description: "Plan a personal event and book venues and event suppliers around one plan.", provider: { "@type": "Organization", name: "Gala Dock", url: `${base}/` }, areaServed: { "@type": "Country", name: "United Kingdom" }, url: `${base}/build-an-event` },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Gala Dock", item: `${base}/` }, { "@type": "ListItem", position: 2, name: "Build an Event", item: `${base}/build-an-event` }] },
    ] }} />

    {/* 5.1 Hero — Your Event Starts as an Idea */}
    <section className="gp-hero gpb-hero" aria-labelledby="be-title">
      <div className="gp-wrap gpb-hero-grid">
        <div className="gpb-hero-copy">
          <Eyebrow>Build your event</Eyebrow>
          <h1 id="be-title" className="gp-h1">Build the whole event, <span className="gp-blue">one decision at a time.</span></h1>
          <p className="gp-lead">Choose the date, find the venue, add food, entertainment, photography, staff and anything else the event needs — all around one plan.</p>
          <div className="gp-cta-row">
            <TLink href={HREF.startBuilding} event="hero_primary_cta" surface={S} variant="start_building" className="gp-btn gp-btn--primary">Start Building<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
            <TLink href={HREF.browseVenues} event="hero_secondary_cta" surface={S} variant="browse_venues" className="gp-btn gp-btn--ghost">Browse Venues</TLink>
          </div>
          <p className="gpb-hero-note"><CircleCheck size={17} aria-hidden="true" />Creating an account and planning are free. Booking fees are shown before you pay.</p>
        </div>
        <BuildPreview />
      </div>
    </section>

    {/* 5.2 What Are You Planning? */}
    <section className="gp-sec gpb-types-sec" aria-labelledby="be-types">
      <div className="gp-wrap">
        <SectionHead id="be-types" eyebrow="Event type" title={<>Start with the kind of event — <span className="gp-blue">Gala Dock adapts the plan.</span></>}
          lead="A wedding needs different things, in a different order, from a children’s party. Pick one to see the plan it starts from." />
        <EventTypes />
      </div>
    </section>

    {/* 5.3 Build It Visually */}
    <section className="gp-sec is-tint gpb-canvas-sec" aria-labelledby="be-canvas">
      <div className="gp-wrap">
        <SectionHead center id="be-canvas" eyebrow="The event build canvas" title={<>See the event take shape <span className="gp-blue">as you add what it needs.</span></>}
          lead="Drag a supplier onto the plan or use the add buttons. The budget and readiness update as each essential is covered." />
        <BuildCanvasSignature />
      </div>
    </section>

    {/* 5.4 Book in the Right Order */}
    <section className="gp-sec gpb-dep-sec" aria-labelledby="be-dep">
      <div className="gp-wrap gpb-dep-grid">
        <div className="gpb-dep-copy">
          <Eyebrow>Dependencies</Eyebrow>
          <h2 id="be-dep" className="gp-h2">An event isn’t a <span className="gp-blue">shopping basket.</span></h2>
          <p className="gp-lead">Some bookings only make sense once others are certain. Gala Dock holds the DJ and caterer for your date while the venue confirms, then opens the booking window for them.</p>
          <ul className="gpb-dep-facts">
            <li><Lock size={18} aria-hidden="true" /><span><b>Provisional holds</b>Suppliers keep the date for a set window, usually 48 hours. Nothing is charged.</span></li>
            <li><Clock3 size={18} aria-hidden="true" /><span><b>Response windows</b>Each request shows when the provider needs to answer by.</span></li>
            <li><CalendarDays size={18} aria-hidden="true" /><span><b>Holds expire</b>If a hold runs out, the date goes back to the provider — nothing is owed.</span></li>
          </ul>
        </div>
        <Dependencies />
      </div>
    </section>

    {/* 5.5 Need It Fast? */}
    <section className="gp-sec is-tint gpb-emg-sec" aria-labelledby="be-emg">
      <div className="gp-wrap">
        <SectionHead id="be-emg" eyebrow="Emergency availability" title={<>Something changed? <span className="gp-blue">Find providers who can respond quickly.</span></>}
          lead="Providers can mark short-notice availability, so last-minute gaps can be filled without starting from scratch." />
        <Emergency />
        <div className="gpb-sec-cta"><TLink href={HREF.startBuilding} surface={S} variant="emergency_start" className="gp-btn gp-btn--primary">Start Building<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink></div>
      </div>
    </section>

    {/* 5.6 Your Plan Builds Around the Date */}
    <section className="gp-sec gpb-time-sec" aria-labelledby="be-time">
      <div className="gp-wrap">
        <SectionHead center id="be-time" eyebrow="Planning timeline" title={<>The right tasks appear <span className="gp-blue">when they matter.</span></>}
          lead="Your plan counts down to the date and surfaces each step at the right moment — nothing to manage, just the next thing to do." />
        <Scope className="gpb-time" amount={0.25}>
          <p className="gpb-time-date"><CalendarDays size={17} aria-hidden="true" />Event date · Sat 24 Jul</p>
          <div className="gpb-time-rail" aria-hidden="true"><svg viewBox="0 0 1000 12" preserveAspectRatio="none"><path d="M0 6 H1000" className="gp-draw" pathLength={1} /></svg><span className="gpb-time-now"><i />Today · 5 weeks to go</span></div>
          <ol className="gpb-time-list">
            {MILESTONES.map(([w, t, d, s], i) => <li key={w} className={cx(`is-${s}`, i % 2 ? "is-down" : "is-up")} data-rv="rise" style={vars({ "--d": 300 + i * 120 })}>
              <span className="gpb-time-node" aria-hidden="true">{s === "done" ? <CircleCheck size={16} /> : s === "lock" ? <Lock size={14} /> : null}</span>
              <span className="gpb-time-card"><time>{w}{w !== "Event day" ? " before" : ""}</time><b>{t}</b><small>{d}</small>{s === "now" && <em className="gp-chip is-wait"><Lock size={12} aria-hidden="true" />After venue confirmation</em>}{s === "done" && <em className="gp-chip is-ok">Done</em>}</span>
            </li>)}
          </ol>
        </Scope>
      </div>
    </section>

    {/* 5.7 Payments and Backups */}
    <section className="gp-sec is-tint gpb-pay-sec" aria-labelledby="be-pay">
      <div className="gp-wrap gpb-pay-grid">
        <div className="gpb-pay-copy">
          <Eyebrow>Booking confidence</Eyebrow>
          <h2 id="be-pay" className="gp-h2">See what is confirmed, pending and <span className="gp-blue">protected by the platform workflow.</span></h2>
          <ul className="gpb-pay-facts">
            <li><Wallet size={18} aria-hidden="true" /><span>You pay each provider directly through Stripe, the payment firm Gala Dock uses. Gala Dock never holds your money.</span></li>
            <li><ShieldCheck size={18} aria-hidden="true" /><span>Providers are paid out through Stripe, and payouts are released on approved triggers — such as the event passing with no issue raised.</span></li>
            <li><RefreshCcw size={18} aria-hidden="true" /><span>Add a backup for critical roles. If the primary drops out, the backup is offered the booking first.</span></li>
          </ul>
          <p className="gp-small gpb-pay-links">How it works: <TLink href={HREF.paymentProtection} surface={S} variant="payment_protection" className="gp-link">payment protection</TLink> · <TLink href={HREF.fees} surface={S} variant="terms_fees" className="gp-link">fees in our Terms</TLink></p>
        </div>
        <Backups />
      </div>
    </section>

    {/* 5.8 The Event Becomes Your Plan */}
    <section className="gp-sec gpb-final" aria-labelledby="be-final">
      <div className="gp-wrap">
        <SectionHead center id="be-final" eyebrow="From build to event day" title={<>The things you chose <span className="gp-blue">become the plan you run.</span></>}
          lead="Every booking already knows its time and place, so the build turns into a simple event-day timeline." />
        <BuildToPlan />
        <div className="gpb-sec-cta">
          <TLink href={HREF.startBuilding} surface={S} variant="final_build" className="gp-btn gp-btn--primary">Build Your Event<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
          <TLink href={HREF.events} surface={S} variant="final_events" className="gp-link">Or find tickets to an event<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink>
        </div>
      </div>
    </section>
  </>;
}
