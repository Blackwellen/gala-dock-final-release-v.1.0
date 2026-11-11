import { ArrowRight, BookOpen, Bot, Globe, KeyRound, Lock, Webhook } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { HREF, pageMetadata } from "@/lib/public/site";
import { siteUrl } from "@/lib/site-url";
import { TLink } from "@/components/site/tracked-link";
import { Scope } from "@/components/site/motion";
import { Eyebrow, JsonLd, SectionHead, vars } from "@/components/site/ui";
import { DevConsole, EventStream, Gateway, SystemRail } from "@/components/site/developers/demos";
import "@/styles/site-developers.css";

export const metadata = pageMetadata({
  path: "/developers",
  title: "Event management API, MCP server and webhooks",
  description: "Connect to Gala Dock with a scoped REST API, an MCP server for AI tools and HMAC-signed webhooks for events, tickets and bookings. Versioned, rate-limited and fully audited.",
});

const S = "developers";

export default async function DevelopersPage() {
  const base = siteUrl();
  // Blueprint 6.1: the primary action depends on auth state — signed-in visitors go straight to their keys.
  const signedIn = await (await createClient()).auth.getUser().then(r => !!r.data.user, () => false);
  const keyHref = signedIn ? HREF.apiKeys : `/login?next=${encodeURIComponent(HREF.apiKeys)}`;
  const docs = <TLink key="docs" href={HREF.docs} event={signedIn ? "hero_secondary_cta" : "hero_primary_cta"} surface={S} variant="read_docs" className={`gp-btn ${signedIn ? "gp-btn--ghost" : "gp-btn--primary"}`}><BookOpen size={18} aria-hidden="true" />Read the Docs</TLink>;
  const key = <TLink key="key" href={keyHref} event={signedIn ? "hero_primary_cta" : "hero_secondary_cta"} surface={S} variant="create_api_key" className={`gp-btn ${signedIn ? "gp-btn--primary" : "gp-btn--ghost"}`}><KeyRound size={18} aria-hidden="true" />Create API Key</TLink>;
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      { "@type": "SoftwareApplication", name: "Gala Dock API", applicationCategory: "DeveloperApplication", operatingSystem: "Web", url: `${base}/developers`, softwareHelp: `${base}${HREF.docs}` },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Gala Dock", item: `${base}/` }, { "@type": "ListItem", position: 2, name: "Developers", item: `${base}/developers` }] },
    ] }} />

    {/* 6.1 Hero — Build on the Event Graph */}
    <section className="gp-hero gpd-hero" aria-labelledby="dev-title">
      <div className="gp-wrap gpd-hero-grid">
        <div className="gpd-hero-copy">
          <Eyebrow>Developers</Eyebrow>
          <h1 id="dev-title" className="gp-h1">Connect to Gala Dock through <span className="gp-blue">API, MCP and webhooks.</span></h1>
          <p className="gp-lead">Build event workflows, synchronise your systems and expose Gala Dock capabilities securely through scoped developer interfaces.</p>
          <div className="gp-cta-row">{signedIn ? [key, docs] : [docs, key]}</div>
          <p className="gpd-hero-plan">API, MCP and webhooks are included on Pro plans and above — <TLink href="/pricing" surface={S} variant="hero_pricing" className="gp-link">see Pricing</TLink>.</p>
        </div>
        <Scope className="gpd-graph" amount={0.2} aria-hidden="true">
          <svg viewBox="0 0 640 460" preserveAspectRatio="none">
            {["M150 230 C 220 230, 230 110, 290 110", "M150 230 H290", "M150 230 C 220 230, 230 350, 290 350"].map((d, i) => <path key={d} d={d} className="gp-draw" pathLength={1} style={vars({ "--d": 300 + i * 160 })} />)}
            {["M420 110 C 470 110, 470 230, 500 230", "M420 230 H500", "M420 350 C 470 350, 470 230, 500 230"].map((d, i) => <path key={d} d={d} className="gp-draw" pathLength={1} style={vars({ "--d": 800 + i * 160 })} />)}
          </svg>
          <div className="gpd-node is-app" data-rv="fade"><Globe size={22} /><b>Your app</b><code>server · agent · tool</code></div>
          {([["API", "/api/v1", Globe, 110], ["MCP", "/api/mcp", Bot, 230], ["Webhooks", "signed POST", Webhook, 350]] as const).map(([t, s, I, y], i) =>
            <div key={t} className="gpd-node is-proto" style={{ top: `${y / 4.6}%`, ...vars({ "--d": 500 + i * 200 }) }} data-rv="pop"><I size={18} /><b>{t}</b><code>{s}</code></div>)}
          <div className="gpd-node is-core" data-rv="fade" style={vars({ "--d": 1200 })}>
            <b>Gala Dock</b>
            <ul>{["Events", "Tickets", "Bookings", "Marketplace"].map((d, i) => <li key={d} data-rv="pop" style={vars({ "--d": 1400 + i * 120 })}>{d}</li>)}</ul>
            <span className="gpd-scope"><Lock size={13} />scoped · events:read</span>
          </div>
        </Scope>
        <ol className="gp-sr" aria-label="How integration works">
          <li>Your application calls Gala Dock through the REST API at /api/v1, the MCP server at /api/mcp, or receives signed webhooks.</li>
          <li>Every request is authenticated with a scoped API key and runs with the permissions of the person who created it.</li>
          <li>Gala Dock exposes events, tickets, bookings and marketplace capabilities.</li>
        </ol>
      </div>
    </section>

    {/* 6.2 Three Ways to Integrate */}
    <section className="gp-sec is-tint gpd-console-sec" id="interfaces" aria-labelledby="dev-ways">
      <div className="gp-wrap">
        <SectionHead center id="dev-ways" eyebrow="Choose the interface" title={<>REST for systems. MCP for tools. <span className="gp-blue">Webhooks for events.</span></>}
          lead="One console, three interfaces. Every example below matches the live contract — the same keys, scopes and payloads." />
        <DevConsole />
      </div>
    </section>

    {/* 6.3 Capabilities, Not Raw Database Access */}
    <section className="gp-sec gpd-gw-sec" aria-labelledby="dev-sec">
      <div className="gp-wrap gpd-gw-grid">
        <div className="gpd-gw-copy">
          <Eyebrow>Secure by design</Eyebrow>
          <h2 id="dev-sec" className="gp-h2">One domain model. <span className="gp-blue">Scoped capabilities.</span></h2>
          <p className="gp-lead">The web app, Gala Agent, the API and MCP all call the same protected domain services. There is no raw database access — only capabilities your key is allowed to use.</p>
          <ul className="gpd-scopes" aria-label="Example scopes">{["events:read", "events:write", "tickets:read", "bookings:write", "marketplace:read", "feed:read"].map(s => <li key={s}><code>{s}</code></li>)}</ul>
        </div>
        <Gateway />
      </div>
    </section>

    {/* 6.4 Events Move Through the Platform */}
    <section className="gp-sec is-tint gpd-stream-sec" aria-labelledby="dev-stream">
      <div className="gp-wrap">
        <SectionHead id="dev-stream" eyebrow="Event stream" title={<>Subscribe to the moments <span className="gp-blue">your system actually cares about.</span></>}
          lead="Webhooks are signed, retried with backoff and replayable. A cursor feed at GET /api/v1/events gives you the same events if you’d rather pull." />
        <EventStream />
        <div className="gpd-sec-cta"><TLink href={HREF.docs} event="developer_docs_open" surface={S} variant="stream_reference" className="gp-link">Webhook reference<ArrowRight size={17} className="gp-arrow" aria-hidden="true" /></TLink></div>
      </div>
    </section>

    {/* 6.5 Designed for Production */}
    <section className="gp-sec gpd-prod-sec" aria-labelledby="dev-prod">
      <div className="gp-wrap">
        <SectionHead center id="dev-prod" eyebrow="Production foundations" title={<>Production integration <span className="gp-blue">needs more than endpoints.</span></>} />
        <SystemRail />
        <div className="gpd-sec-cta">
          <TLink href={HREF.docs} event="developer_docs_open" surface={S} variant="prod_docs" className="gp-btn gp-btn--primary">Explore Developer Documentation<ArrowRight size={18} className="gp-arrow" aria-hidden="true" /></TLink>
          <a href={HREF.openapi} className="gp-btn gp-btn--ghost">OpenAPI document</a>
        </div>
      </div>
    </section>
  </>;
}
