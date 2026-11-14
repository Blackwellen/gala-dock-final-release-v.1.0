import { ArrowRight, PartyPopper } from "lucide-react";
import { HREF, pageMetadata } from "@/lib/public/site";
import { siteUrl } from "@/lib/site-url";
import { LEGAL } from "@/lib/legal";
import { loadPricing } from "@/lib/public/pricing";
import { TLink } from "@/components/site/tracked-link";
import { Eyebrow, gbp, JsonLd, SectionHead } from "@/components/site/ui";
import { Credits, PlanExplorer, PricingFaq, ProviderEconomics, type Faq } from "@/components/site/pricing/pricing-client";
import { supportedCountryNames } from "@/lib/payments/connect-countries";
import "@/styles/site-pricing.css";

export const metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing — event management software, marketplace and ticketing fees",
  description: "Gala Dock pricing for organisers and providers: free Starter plans, Pro, Business and Enterprise, provider marketplace fees, ticketing fees and Gala Agent credit packs. Prices exclude VAT.",
});

const S = "pricing";

export default async function PricingPage() {
  const base = siteUrl();
  const { plans, packs } = await loadPricing();
  const vatPct = Number.parseFloat(LEGAL.vatRate) || 20;
  const packLine = packs.length ? packs.map(p => `${p.credits.toLocaleString("en-GB")} credits for ${gbp(p.priceMinor)}`).join(", ") + " (plus VAT)" : "Pricing confirmed before purchase";
  const faqs: Faq[] = [
    { q: "Is Gala Dock free for customers?", a: `Yes. Creating an account and planning a personal event are free. When you buy tickets there is a buyer fee of ${LEGAL.fees.ticketBuyer}, and booking payments carry a booking admin fee of ${LEGAL.fees.bookingAdmin}. Both are shown before you pay.` },
    { q: "Can providers list for free?", a: `Yes. Venues and suppliers start on the free Starter plan and pay a platform fee only on bookings: ${LEGAL.fees.supplier}.` },
    { q: "When is the marketplace fee taken?", a: "When the booking payment is taken. Customers pay into the provider’s own Stripe account, and Gala Dock’s fee is taken from that payment as an application fee. Payouts are released on approved triggers." },
    { q: "Where can sellers get paid?", a: `Venues, suppliers and ticket sellers can take payments through Gala Dock if their business is based in one of the ${supportedCountryNames().length} countries where Stripe supports our seller accounts: ${supportedCountryNames().join(", ")}. Businesses elsewhere can still list as enquiry-only and run free events. Details: Help, “Where you can get paid”.` },
    { q: "How much does it cost to sell tickets?", a: `Ticket sellers pay ${LEGAL.fees.ticketSeller}. Buyers pay ${LEGAL.fees.ticketBuyer}. Free tickets carry no ticket fee.` },
    { q: "How do Gala Agent credits work?", a: `Each organiser and provider plan includes a monthly allowance of Gala Agent credits. Owners can add credit packs (${packLine}), get alerts as usage grows, and choose whether the Agent stops at the limit or uses approved overage.` },
    { q: "Can I upgrade or downgrade at any time?", a: "Yes. Upgrades take effect straight away and are prorated. Downgrades take effect at the end of the current billing period." },
    { q: "What happens to my data if I downgrade?", a: "The change applies at the end of the billing period. Before you switch, check the lower plan’s limits for active events or listings, team members, storage and Gala Agent credits against what your workspace uses today." },
    { q: "Do I get API access?", a: "API keys, webhooks and the MCP server are included on Pro, Business and Enterprise plans for both organisers and providers." },
  ];
  const offers = plans.filter(p => !p.contact).flatMap(p => [p.month !== null ? { "@type": "Offer", name: `${p.kind === "organizer" ? "Organiser" : "Provider"} ${p.name} (monthly)`, price: (p.month / 100).toFixed(2), priceCurrency: "GBP",
    priceSpecification: { "@type": "UnitPriceSpecification", price: (p.month / 100).toFixed(2), priceCurrency: "GBP", unitCode: "MON", valueAddedTaxIncluded: false } } : null].filter(Boolean));
  return <div id="pricing">
    {offers.length > 0 && <JsonLd data={{ "@context": "https://schema.org", "@type": "Product", name: "Gala Dock", description: "Event management and event marketplace platform.", brand: { "@type": "Brand", name: "Gala Dock" }, url: `${base}/pricing`, offers }} />}

    {/* 8.1 Hero */}
    <section className="gp-hero gpr-hero" aria-labelledby="price-title">
      <div className="gp-wrap gp-head is-center gpr-hero-in">
        <Eyebrow center>Pricing</Eyebrow>
        <h1 id="price-title" className="gp-h1">Pricing that works from one event to <span className="gp-blue">an entire operation.</span></h1>
        <p className="gp-lead">Start free. Organisers pay for the operating capability they need; providers start with marketplace economics; Gala Agent runs on credits with budget controls.</p>
        <div className="gp-cta-row gpr-hero-cta">
          <TLink href={HREF.getStarted} event="hero_primary_cta" surface={S} variant="start_free" className="gp-btn gp-btn--primary">Start Free<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
          <TLink href={HREF.contact} event="hero_secondary_cta" surface={S} variant="talk_to_sales" className="gp-btn gp-btn--ghost">Talk to Sales</TLink>
        </div>
        <p className="gpr-callout"><PartyPopper size={18} aria-hidden="true" /><span><b>Planning your own event?</b> Customer accounts are free. Ticket and booking fees are shown before you pay — <TLink href="/build-an-event" surface={S} variant="callout_build" className="gp-link">build an event</TLink>.</span></p>
      </div>
    </section>

    {/* 8.1 controls + 8.2 Plans */}
    {plans.length ? <PlanExplorer plans={plans} /> : <section className="gp-sec"><div className="gp-wrap"><p className="gpr-unavailable">Plan prices are temporarily unavailable. Please try again shortly or <TLink href={HREF.contact} surface={S} variant="prices_unavailable" className="gp-link">contact us</TLink>.</p></div></section>}

    {/* 8.3 Provider Economics */}
    <section className="gp-sec is-tint gpr-econ-sec" id="providers" aria-labelledby="price-econ">
      <div className="gp-wrap">
        <SectionHead id="price-econ" eyebrow="Providers" title={<>Start with marketplace economics, <span className="gp-blue">then upgrade when the business needs more.</span></>}
          lead="List free and pay a platform fee only when you’re booked. Higher plans lower the fee and add team tools, Gala Agent and integrations." />
        <ProviderEconomics plans={plans} vatPct={vatPct} bookingAdmin={LEGAL.fees.bookingAdmin} />
        <div className="gpr-sec-cta"><TLink href={HREF.joinProvider} surface={S} variant="econ_join" className="gp-btn gp-btn--primary">Join as a Provider<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink><TLink href="/providers" surface={S} variant="econ_providers" className="gp-link">How it works for providers</TLink></div>
      </div>
    </section>

    {/* 8.4 AI When You Need It */}
    <section className="gp-sec gpr-credits-sec" aria-labelledby="price-credits">
      <div className="gp-wrap">
        <SectionHead id="price-credits" eyebrow="Gala Agent credits" title={<>Use Agent capacity when the work needs it — <span className="gp-blue">with budget controls built in.</span></>}
          lead="Every organiser and provider plan includes monthly credits. Top up with packs when you need more, and decide what happens at the limit." />
        <Credits plans={plans} packs={packs} />
        <div className="gpr-sec-cta"><TLink href="/organisers" surface={S} variant="credits_organisers" className="gp-link">Gala Agent for organisers<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink></div>
      </div>
    </section>

    {/* 8.5 Transactional Pricing */}
    <section className="gp-sec is-tint gpr-tx-sec" aria-labelledby="price-tx">
      <div className="gp-wrap">
        <SectionHead id="price-tx" eyebrow="Transactions" title={<>Know when platform fees apply <span className="gp-blue">before you buy.</span></>}
          lead={`Fees are platform usage fees. Business fees are shown plus VAT; consumer fees include VAT (${LEGAL.vatRate}).`} />
        <div className="gpr-tx gp-panel">
          <table>
            <thead><tr><th scope="col">Transaction</th><th scope="col">Who pays</th><th scope="col">When</th><th scope="col">Pricing basis</th><th scope="col">Notes</th></tr></thead>
            <tbody>
              <tr><th scope="row">Venue or supplier booking</th><td data-l="Who pays">Provider, and the customer</td><td data-l="When">When the booking payment is taken</td><td data-l="Pricing basis">Provider: {LEGAL.fees.supplier}. Customer: booking admin fee of {LEGAL.fees.bookingAdmin}</td><td data-l="Notes">Paid into the provider’s Stripe account; payouts released on approved triggers</td></tr>
              <tr><th scope="row">Paid tickets</th><td data-l="Who pays">Ticket seller, and the buyer</td><td data-l="When">At purchase</td><td data-l="Pricing basis">Seller: {LEGAL.fees.ticketSeller}. Buyer: {LEGAL.fees.ticketBuyer}</td><td data-l="Notes">Free tickets carry no ticket fee</td></tr>
              <tr><th scope="row">Official resale</th><td data-l="Who pays">Resale buyer and seller</td><td data-l="When">When a resale ticket sells</td><td data-l="Pricing basis">Pricing confirmed before purchase</td><td data-l="Notes">Resale prices are capped at the original price paid</td></tr>
              <tr><th scope="row">Event promotion</th><td data-l="Who pays">Organiser</td><td data-l="When">When a promotion is booked</td><td data-l="Pricing basis">Pricing confirmed before purchase</td><td data-l="Notes">Optional paid placement</td></tr>
              <tr><th scope="row">Gala Agent credit packs</th><td data-l="Who pays">Organiser or provider workspace</td><td data-l="When">At purchase</td><td data-l="Pricing basis">{packLine}</td><td data-l="Notes">On top of the credits included in each plan</td></tr>
            </tbody>
          </table>
        </div>
        <p className="gpr-tx-note">Full detail in our <TLink href={HREF.fees} surface={S} variant="terms_fees" className="gp-link">Terms of Service</TLink> and <TLink href="/ticket-terms" surface={S} variant="ticket_terms" className="gp-link">Ticket Terms</TLink>.</p>
      </div>
    </section>

    {/* 8.6 FAQ / Conversion Close */}
    <section className="gp-sec gpr-faq-sec" aria-labelledby="price-faq">
      <div className="gp-wrap gpr-faq-wrap">
        <SectionHead center id="price-faq" eyebrow="Questions" title="The details people need before they start." />
        <PricingFaq items={faqs} />
        <div className="gpr-close">
          <TLink href={HREF.getStarted} surface={S} variant="close_start" className="gp-btn gp-btn--primary">Start Free<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
          <TLink href={HREF.contact} surface={S} variant="close_sales" className="gp-btn gp-btn--ghost">Talk to Sales</TLink>
        </div>
        <p className="gpr-more">Not sure which plan fits? <TLink href="/organisers" surface={S} variant="more_org" className="gp-link">Organisers</TLink> · <TLink href="/providers" surface={S} variant="more_pro" className="gp-link">Providers</TLink> · <TLink href="/developers" surface={S} variant="more_dev" className="gp-link">Developers</TLink></p>
      </div>
    </section>
  </div>;
}
