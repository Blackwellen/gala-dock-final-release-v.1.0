import { ArrowRight, CalendarDays, Compass, Landmark, Link2, ShieldCheck, Store, UsersRound, Workflow, Zap } from "lucide-react";
import { HREF, pageMetadata } from "@/lib/public/site";
import { siteUrl } from "@/lib/site-url";
import { LEGAL } from "@/lib/legal";
import { TLink } from "@/components/site/tracked-link";
import { Scope } from "@/components/site/motion";
import { Eyebrow, Feature, JsonLd, SectionHead, vars } from "@/components/site/ui";
import { HeroGraph } from "@/components/site/landing/hero-graph";
import { ThreeWays } from "@/components/site/landing/three-ways";
import { BuildCanvas } from "@/components/site/landing/build-canvas";
import { Lifecycle } from "@/components/site/landing/lifecycle";
import { Marketplace } from "@/components/site/landing/marketplace";
import { RecordTree } from "@/components/site/landing/record-tree";
import { LegacyHash } from "@/components/site/legacy-hash";
import "@/styles/site-landing.css";

export const metadata = pageMetadata({
  path: "/", absolute: true,
  title: "Gala Dock — the connected event platform for planning, venues, suppliers and tickets",
  description: "Plan events, find venues and event suppliers, sell tickets and run event operations in one connected platform. Build an event, run events professionally or list your venue or services.",
});

const S = "landing";

export default function LandingPage() {
  const base = siteUrl();
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      { "@type": "WebSite", "@id": `${base}/#website`, url: `${base}/`, name: "Gala Dock", publisher: { "@id": `${base}/#organization` },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${base}/events?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
      { "@type": "Organization", "@id": `${base}/#organization`, name: "Gala Dock", legalName: LEGAL.entity.name, url: `${base}/`, logo: `${base}/icons/icon-192.png`, email: LEGAL.contact.support },
      { "@type": "SoftwareApplication", name: "Gala Dock", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: `${base}/`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "GBP", description: "Customer accounts and the Starter plan are free." } },
    ] }} />
    <LegacyHash />

    {/* 2.1 Hero — The Event Dock */}
    <section className="gp-hero gpl-hero" aria-labelledby="hero-title">
      <div className="gp-wrap gpl-hero-grid">
        <div className="gpl-hero-copy">
          <Eyebrow>The connected event platform</Eyebrow>
          <h1 id="hero-title" className="gp-h1">Everything an event needs. <span className="gp-blue">One place to build it.</span></h1>
          <p className="gp-lead">Plan events, source venues and suppliers, sell tickets, manage operations and bring the whole event together through one connected platform.</p>
          <div className="gp-cta-row">
            <TLink href="/build-an-event" event="hero_primary_cta" surface={S} variant="build_an_event" className="gp-btn gp-btn--primary">Build an Event<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
            <TLink href="#three-ways" event="hero_secondary_cta" surface={S} variant="explore" className="gp-btn gp-btn--ghost"><Compass size={19} className="gp-play" aria-hidden="true" />Explore Gala Dock</TLink>
          </div>
          <ul className="gpl-trust" aria-label="Who Gala Dock is for">
            {([["/build-an-event", UsersRound, "For Customers", "Bring your event to life"], ["/organisers", CalendarDays, "For Organisers", "Plan, sell and deliver"], ["/providers", Store, "For Providers", "Find work and grow"]] as const).map(([h, I, t, s]) =>
              <li key={h}><TLink href={h} event="persona_route_select" surface={S} variant={`trust_${t}`}><span className="gpl-trust-ic"><I size={22} aria-hidden="true" /></span><span><b>{t}</b><small>{s}</small></span></TLink></li>)}
          </ul>
        </div>
        <HeroGraph />
      </div>
    </section>

    {/* 2.2 Three Ways Into Gala Dock */}
    <section className="gp-sec gpl-ways" id="three-ways" aria-labelledby="ways-title">
      <div className="gp-wrap">
        <SectionHead center id="ways-title" eyebrow="Start where you fit" title={<>Three ways into <span className="gp-blue">one event network.</span></>}
          lead="Whether you’re planning a personal celebration, running events professionally or providing venues and services, Gala Dock gives you the tools and connections in one place." />
        <ThreeWays />
      </div>
    </section>

    {/* 2.3 Build the Whole Event */}
    <section className="gp-sec gpl-whole" aria-labelledby="whole-title">
      <div className="gp-wrap gpl-whole-grid">
        <div className="gpl-whole-copy">
          <Eyebrow>Build around the event</Eyebrow>
          <h2 id="whole-title" className="gp-h2">Every piece stays connected to <span className="gp-blue">the same plan.</span></h2>
          <p className="gp-lead">From hiring a hall to finding the DJ, bar staff, photographer and security — Gala Dock connects the pieces around one event.</p>
          <ul className="gp-feats">
            <Feature icon={Link2} title="One event, everything connected" text="Every booking, cost and timing stays on the plan." />
            <Feature icon={Workflow} title="Availability and dependencies" text="See what to book next and what depends on it." />
            <Feature icon={ShieldCheck} title="Real venues and suppliers" text="Verified providers who respond to your event." />
          </ul>
          <div className="gp-cta-row"><TLink href="/build-an-event" surface={S} variant="whole_build" className="gp-btn gp-btn--primary">Plan an event<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink></div>
        </div>
        <BuildCanvas />
      </div>
    </section>

    {/* 2.4 From Plan to Event Day */}
    <section className="gp-sec is-tint gpl-lifecycle" aria-labelledby="life-title">
      <div className="gp-wrap">
        <SectionHead center id="life-title" eyebrow="One connected lifecycle" title={<>From Plan to <span className="gp-blue">Event Day.</span></>}
          lead="Gala Dock carries the event through its full lifecycle, with the right tools, people and records at every stage — all connected to the same plan.">
          <p className="gp-subline">Plan. Source. Book. Sell. Promote. Run. Settle.</p>
        </SectionHead>
        <Lifecycle />
      </div>
    </section>

    {/* 2.5 Marketplace With Event Context */}
    <section className="gp-sec gpl-market" aria-labelledby="market-title">
      <div className="gp-wrap">
        <SectionHead center id="market-title" eyebrow="Matched to the event" title={<>Not just listings. <span className="gp-blue">Relevant availability, fit and reliability.</span></>}
          lead="Gala Dock understands the event you’re planning and ranks venues and suppliers by your date, location, guest numbers and requirements." />
        <Marketplace />
        <div className="gpl-market-cta">
          <TLink href="/providers" surface={S} variant="market_providers" className="gp-btn gp-btn--ghost">Explore Providers<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
          <TLink href="/build-an-event" surface={S} variant="market_build" className="gp-btn gp-btn--primary">Build an Event<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
        </div>
      </div>
    </section>

    {/* 2.6 One Event. One Operating Record. */}
    <section className="gp-sec is-tint gpl-record" aria-labelledby="record-title">
      <div className="gp-wrap gpl-record-grid">
        <div className="gpl-record-copy">
          <Eyebrow>One record</Eyebrow>
          <h2 id="record-title" className="gp-h2">One event. <span className="gp-blue">One operating record.</span></h2>
          <p className="gp-lead">Every booking, ticket, supplier, guest, payment and operational decision stays connected to the event — so the whole team works from the same version.</p>
          <ul className="gp-feats">
            <Feature icon={Link2} title="Everything connected" text="One record for every part of the event." />
            <Feature icon={UsersRound} title="Clear relationships" text="See how bookings, tickets and suppliers fit together." />
            <Feature icon={Zap} title="Change once" text="Updates carry across the whole event." />
            <Feature icon={Landmark} title="Ready for any size" text="From private parties to multi-venue festivals." />
          </ul>
          <div className="gp-cta-row">
            <TLink href="/organisers" surface={S} variant="record_organisers" className="gp-btn gp-btn--primary">Explore for Organisers<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
            <TLink href="/developers" surface={S} variant="record_developers" className="gp-btn gp-btn--ghost">See Developer APIs</TLink>
          </div>
        </div>
        <RecordTree />
      </div>
    </section>

    {/* 2.7 Closing CTA — Start Where You Are */}
    <section className="gp-sec gpl-close" aria-labelledby="close-title">
      <Scope className="gp-wrap" amount={0.3}>
        <header className="gp-head is-center" data-rv="fade">
          <Eyebrow center>Start with the event</Eyebrow>
          <h2 id="close-title" className="gp-h2">Whether it’s one birthday or fifty live events, <span className="gp-blue">start with the event.</span></h2>
          <p className="gp-lead">Gala Dock gives you the tools, people and connections to plan, book, sell, promote and run your event — all in one place.</p>
        </header>
        <ul className="gpl-close-actions">
          {([["/build-an-event", CalendarDays, "Build an Event", "Plan your celebration or gathering"], ["/organisers", UsersRound, "Run Events Professionally", "For organisers and event managers"], ["/providers", Store, "List Your Business", "For venues and suppliers"]] as const).map(([h, I, t, s], i) =>
            <li key={h} data-rv="rise" style={vars({ "--d": 120 + i * 90 })}><TLink href={h} event="persona_route_select" surface={S} variant={`close_${t}`} className="gpl-close-link"><span className="gpl-close-ic"><I size={24} aria-hidden="true" /></span><span><b>{t}<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></b><small>{s}</small></span></TLink></li>)}
        </ul>
        <p className="gpl-close-note" data-rv="fade" style={vars({ "--d": 420 })}><ShieldCheck size={18} aria-hidden="true" /><b>Creating an account is free.</b><span>Join the side that fits you — <TLink href={HREF.startBuilding} surface={S} variant="close_signup" className="gp-link">get started</TLink>.</span></p>
      </Scope>
    </section>
  </>;
}
