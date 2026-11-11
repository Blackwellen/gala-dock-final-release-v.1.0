import { ArrowRight, BarChart3, CalendarDays, Clock3, Goal, Link2, ShieldCheck, Target, Ticket, Megaphone, UsersRound, CircleAlert, Workflow, Compass, PlayCircle } from "lucide-react";
import { HREF, pageMetadata } from "@/lib/public/site";
import { siteUrl } from "@/lib/site-url";
import { TLink } from "@/components/site/tracked-link";
import { Eyebrow, Feature, JsonLd, SectionHead } from "@/components/site/ui";
import { CommandRibbon } from "@/components/site/organisers/command-ribbon";
import { EventRecord } from "@/components/site/organisers/event-record";
import { Procurement } from "@/components/site/organisers/procurement";
import { LaunchDesk } from "@/components/site/organisers/launch-desk";
import { LiveOps } from "@/components/site/organisers/live-ops";
import { Mission } from "@/components/site/organisers/mission";
import "@/styles/site-organisers.css";

export const metadata = pageMetadata({
  path: "/organisers",
  title: "Event management software for organisers, agencies and promoters",
  description: "Run every event from one operating system: planning, venue and supplier sourcing, ticketing, promotion, event-day operations and settlement, with Gala Agent for goal-driven work.",
});

const S = "organisers";

export default function OrganisersPage() {
  const base = siteUrl();
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      { "@type": "SoftwareApplication", name: "Gala Dock for Organisers", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: `${base}/organisers`, offers: { "@type": "Offer", price: "0", priceCurrency: "GBP", description: "Starter plan" } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Gala Dock", item: `${base}/` }, { "@type": "ListItem", position: 2, name: "Organisers", item: `${base}/organisers` }] },
    ] }} />

    {/* 3.1 Hero — Events Without the Fragmentation */}
    <section className="gp-hero gpo-hero" aria-labelledby="org-title">
      <div className="gp-wrap gpo-hero-grid">
        <div className="gpo-hero-copy">
          <Eyebrow>For professional organisers</Eyebrow>
          <h1 id="org-title" className="gp-h1">Run the whole event from <span className="gp-blue">one operating system.</span></h1>
          <p className="gp-lead">Sales, planning, venues, suppliers, tickets, teams, promotion, event-day operations and settlement stay connected from first enquiry to final closeout.</p>
          <div className="gp-cta-row">
            <TLink href={HREF.startOrganising} event="hero_primary_cta" surface={S} variant="start_organising" className="gp-btn gp-btn--primary">Start Organising<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
            <TLink href="/pricing" event="hero_secondary_cta" surface={S} variant="view_pricing" className="gp-btn gp-btn--ghost"><PlayCircle size={19} className="gp-play" aria-hidden="true" />View Pricing</TLink>
          </div>
          <ul className="gp-feats is-row gpo-hero-feats">
            <Feature icon={CalendarDays} title="Many events" text="Plan and manage a portfolio" />
            <Feature icon={Link2} title="Everything connected" text="One record per event" />
            <Feature icon={BarChart3} title="Less admin" text="More time for the event" />
          </ul>
        </div>
        <CommandRibbon />
      </div>
    </section>

    {/* 3.2 The Event Record */}
    <section className="gp-sec is-tint gpo-rec-sec" aria-labelledby="org-record">
      <div className="gp-wrap">
        <SectionHead center id="org-record" eyebrow="One event, five views" title={<>Five views. One event. <span className="gp-blue">No disconnected planning maze.</span></>}
          lead="From first idea to final settlement, Gala Dock keeps every part of the event in one record — so nothing gets lost, duplicated or forgotten." />
        <EventRecord />
      </div>
    </section>

    {/* 3.3 Source With Context */}
    <section className="gp-sec gpo-proc-sec" aria-labelledby="org-proc">
      <div className="gp-wrap">
        <div className="gpo-split-head">
          <SectionHead id="org-proc" eyebrow="Procurement" title={<>Find the right venue and providers — <span className="gp-blue">not just more options.</span></>}
            lead="Professional venue and supplier sourcing with real event context, comparison, conditional holds and backup options." />
          <ul className="gp-feats is-row gpo-head-feats">
            <Feature icon={Target} title="Relevant matches" text="Ranked against your brief" />
            <Feature icon={ShieldCheck} title="Availability you can see" text="Dates and response times shown" />
            <Feature icon={UsersRound} title="Backup options" text="Keep the event protected" />
          </ul>
        </div>
        <Procurement />
        <div className="gpo-sec-cta"><TLink href="/providers" surface={S} variant="procure_providers" className="gp-link">How providers respond to your requests<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink></div>
      </div>
    </section>

    {/* 3.4 Sell and Promote */}
    <section className="gp-sec is-tint gpo-sell-sec" aria-labelledby="org-sell">
      <div className="gp-wrap">
        <div className="gpo-split-head">
          <SectionHead id="org-sell" eyebrow="Sell & promote" title={<>Launch the event where <span className="gp-blue">the audience can actually find it.</span></>}
            lead="Connect ticketing, event-native media and Gala Dock-owned discovery to put the event in front of the right audience." />
          <ul className="gp-feats is-row gpo-head-feats">
            <Feature icon={Ticket} title="Ticketing" text="Tiers and release dates" />
            <Feature icon={Megaphone} title="Event promotion" text="Event pages and calendars" />
            <Feature icon={Compass} title="Discovery" text="Listed where people look" />
          </ul>
        </div>
        <LaunchDesk />
        <div className="gpo-sec-cta"><TLink href="/pricing" surface={S} variant="sell_pricing" className="gp-link">See ticketing fees on Pricing<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink><TLink href={HREF.events} surface={S} variant="sell_events" className="gp-link">Browse public events<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink></div>
      </div>
    </section>

    {/* 3.5 Event-Day Command */}
    <section className="gp-sec gpo-live-sec" aria-labelledby="org-live">
      <div className="gp-wrap">
        <div className="gpo-split-head">
          <SectionHead id="org-live" eyebrow="Live operations" title={<>Know what is happening now — <span className="gp-blue">and what needs attention next.</span></>}
            lead="From doors opening to the final act, Gala Dock keeps the event on track with a live run sheet, provider status and early warnings." />
          <ul className="gp-feats is-row gpo-head-feats">
            <Feature icon={Clock3} title="Live timeline" text="What is happening right now" />
            <Feature icon={UsersRound} title="Provider status" text="Arrivals and set-up" />
            <Feature icon={CircleAlert} title="Early warnings" text="Issues surface before they grow" />
          </ul>
        </div>
        <LiveOps />
      </div>
    </section>

    {/* 3.6 Gala Agent for Organisers */}
    <section className="gp-sec is-tint gpo-agent-sec" aria-labelledby="org-agent">
      <div className="gp-wrap gpo-agent-grid">
        <div className="gpo-agent-copy">
          <Eyebrow>Gala Agent</Eyebrow>
          <h2 id="org-agent" className="gp-h2">Give Gala Agent a goal — <span className="gp-blue">not another chat window.</span></h2>
          <p className="gp-lead">Gala Agent takes goal-driven work off your plate, coordinates across the event and keeps you informed with clear actions, approvals and next steps.</p>
          <ul className="gp-feats">
            <Feature icon={Goal} title="Goal driven" text="Set an objective, not a list of questions." />
            <Feature icon={Workflow} title="Works across the event" text="Venues, suppliers, tickets, promotion and operations." />
            <Feature icon={Clock3} title="Handles external waits" text="Tracks quotes, availability and replies." />
            <Feature icon={ShieldCheck} title="You stay in control" text="Approvals for every consequential step." />
          </ul>
          <p className="gp-small gpo-agent-credit">Gala Agent runs on workspace credits included in organiser plans. Connecting your own systems instead? Scoped API keys, MCP and signed webhooks come with Pro and above — <TLink href="/developers" surface={S} variant="agent_developers" className="gp-link">see the developer platform</TLink>.</p>
          <div className="gp-cta-row">
            <TLink href={HREF.startOrganising} surface={S} variant="agent_start" className="gp-btn gp-btn--primary">Start Organising<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
            <TLink href="/pricing" surface={S} variant="agent_pricing" className="gp-btn gp-btn--ghost">Explore Pricing</TLink>
          </div>
        </div>
        <Mission />
      </div>
    </section>

  </>;
}
