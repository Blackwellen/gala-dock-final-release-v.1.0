import { ArrowRight, BadgeCheck, CalendarCheck, Clock3, ShieldCheck, Star, Wallet, XCircle } from "lucide-react";
import { HREF, pageMetadata } from "@/lib/public/site";
import { siteUrl } from "@/lib/site-url";
import { TLink } from "@/components/site/tracked-link";
import { Eyebrow, JsonLd, SectionHead } from "@/components/site/ui";
import { AdaptiveWorkspace, OpportunityStream, PackageBuilder, ReliabilityRing, RespondDemo } from "@/components/site/providers/demos";
import "@/styles/site-providers.css";

export const metadata = pageMetadata({
  path: "/providers",
  title: "List your venue or event services and get event bookings",
  description: "Venues and event suppliers on Gala Dock receive matched event opportunities, quote and confirm bookings, run delivery with their team and get paid through Stripe.",
});

const S = "providers";

export default function ProvidersPage() {
  const base = siteUrl();
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      { "@type": "Service", name: "Gala Dock for venues and event providers", serviceType: "Event venue and supplier marketplace", provider: { "@type": "Organization", name: "Gala Dock", url: `${base}/` }, areaServed: { "@type": "Country", name: "United Kingdom" }, url: `${base}/providers` },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Gala Dock", item: `${base}/` }, { "@type": "ListItem", position: 2, name: "Providers", item: `${base}/providers` }] },
    ] }} />

    {/* 4.1 Hero — Turn Availability Into Bookings */}
    <section className="gp-hero gpp-hero" aria-labelledby="pro-title">
      <div className="gp-wrap gpp-hero-grid">
        <div className="gpp-hero-copy">
          <Eyebrow>For venues &amp; event providers</Eyebrow>
          <h1 id="pro-title" className="gp-h1">List what you provide. Find the right events. <span className="gp-blue">Run every booking professionally.</span></h1>
          <p className="gp-lead">Gala Dock connects venues and event-service providers with customers and professional organisers, and keeps availability, quotes, teams, delivery and payments in one place.</p>
          <div className="gp-cta-row">
            <TLink href={HREF.joinProvider} event="hero_primary_cta" surface={S} variant="join_provider" className="gp-btn gp-btn--primary">Join as a Provider<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
            <TLink href="#workspace" event="hero_secondary_cta" surface={S} variant="explore_tools" className="gp-btn gp-btn--ghost">Explore Provider Tools</TLink>
          </div>
          <p className="gpp-hero-fit">For venues, suppliers and businesses that do both. <TLink href={HREF.events} surface={S} variant="hero_events" className="gp-link">See events on Gala Dock<ArrowRight size={16} className="gp-arrow" aria-hidden="true" /></TLink></p>
        </div>
        <OpportunityStream />
      </div>
    </section>

    {/* 4.2 One Provider Workspace */}
    <section className="gp-sec is-tint gpp-ws-sec" id="workspace" aria-labelledby="pro-ws">
      <div className="gp-wrap">
        <SectionHead id="pro-ws" eyebrow="Adapts to your business" title={<>Your business decides the workspace — <span className="gp-blue">not Gala Dock’s navigation.</span></>}
          lead="Tell Gala Dock what you offer and the workspace reshapes around it. Common operations stay in one place whichever mode you run." />
        <AdaptiveWorkspace />
      </div>
    </section>

    {/* 4.3 Respond Before the Opportunity Disappears */}
    <section className="gp-sec gpp-resp-sec" aria-labelledby="pro-resp">
      <div className="gp-wrap">
        <SectionHead id="pro-resp" eyebrow="Response SLA" title={<>Fast replies win confidence. <span className="gp-blue">Gala Dock makes the deadline visible.</span></>}
          lead="Every request shows how long you have to respond, with quick actions and specialist states for holds, standby and short-notice work." />
        <RespondDemo />
      </div>
    </section>

    {/* 4.4 Build Your Commercial Offer */}
    <section className="gp-sec is-tint gpp-offer-sec" aria-labelledby="pro-offer">
      <div className="gp-wrap">
        <div className="gpp-offer-head">
          <SectionHead id="pro-offer" eyebrow="Packages & commercials" title={<>Package what you sell <span className="gp-blue">without flattening every provider into one pricing model.</span></>}
            lead="Venues and suppliers price differently. Gala Dock gives each their own fields — minimum spends and staffing for venues, travel and coverage for services — on one platform." />
          <TLink href={HREF.joinProvider} surface={S} variant="offer_list" className="gp-btn gp-btn--primary">List Your Business<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
        </div>
        <PackageBuilder />
      </div>
    </section>

    {/* 4.5 Deliver. Get Reviewed. Grow. */}
    <section className="gp-sec gpp-rel-sec" aria-labelledby="pro-rel">
      <div className="gp-wrap gpp-rel-grid">
        <div className="gpp-rel-copy">
          <Eyebrow>Reliability</Eyebrow>
          <h2 id="pro-rel" className="gp-h2">Every completed booking <span className="gp-blue">strengthens the business profile.</span></h2>
          <p className="gp-lead">Reliability is built from what actually happens on bookings — not from vanity numbers.</p>
          <dl className="gpp-metrics" aria-label="Example provider metrics">
            {([[Clock3, "Response rate", "96%", "Requests answered before their deadline"], [CalendarCheck, "On-time rate", "99%", "Checked in on site by the agreed time"], [XCircle, "Cancellation rate", "0.5%", "Confirmed bookings the provider cancelled"], [Star, "Verified reviews", "42", "From customers with a completed booking"]] as const).map(([I, k, v, d]) =>
              <div key={k}><dt><I size={18} aria-hidden="true" />{k}</dt><dd><b>{v}</b><small>{d}</small></dd></div>)}
          </dl>
          <p className="gp-small gpp-example">Figures shown are an example profile, not platform statistics.</p>
          <div className="gp-cta-row">
            <TLink href={HREF.joinProvider} surface={S} variant="rel_list" className="gp-btn gp-btn--primary">List Your Business<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
            <TLink href="/pricing#providers" surface={S} variant="rel_pricing" className="gp-btn gp-btn--ghost">Provider pricing</TLink>
          </div>
          <ul className="gpp-trust">
            <li><Wallet size={17} aria-hidden="true" />Customers pay into your own Stripe account</li>
            <li><BadgeCheck size={17} aria-hidden="true" />Listings are reviewed before they appear</li>
            <li><ShieldCheck size={17} aria-hidden="true" />Only completed bookings can be reviewed</li>
          </ul>
        </div>
        <ReliabilityRing />
      </div>
    </section>
  </>;
}
