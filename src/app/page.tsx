import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight, BadgeCheck, BarChart3, Building2, CalendarDays, Check, ClipboardList, CreditCard, FileText,
  Fingerprint, KeyRound, Layers, LockKeyhole, Megaphone, MessageSquareText, Rocket, ScrollText, Search,
  ShieldCheck, Sparkles, Store, Ticket, UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { LEGAL } from "@/lib/legal";
import { LandingHeader } from "@/components/landing/landing-header";
import { AgentDemo } from "@/components/landing/agent-demo";
import { Faq, type FaqItem } from "@/components/landing/faq";
import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Gala Dock — Plan, run and book extraordinary events",
  description:
    "Gala Dock brings event discovery, professional event management and venue and service bookings into one platform. One account for customers, organizers and providers — with Gala Agent, your AI planning assistant.",
};

const img = (name: string) => `/assets/regenerated/${name}.png`;

const experiences = [
  {
    key: "customer", icon: Users, label: "Customer", title: "Discover and attend",
    text: "Find events worth going to, buy tickets in a few taps and keep every booking in one wallet.",
    points: ["Browse events, venues and services", "Secure checkout and digital tickets", "Plan personal celebrations"],
    image: "experience-0", alt: "Candle-lit waterfront dinner table set for a celebration at sunset",
  },
  {
    key: "organizer", icon: Building2, label: "Organizer", title: "Run events professionally",
    text: "A workspace for your team to plan, sell and deliver events — from first proposal to final check-in.",
    points: ["Team roles and collaboration", "Proposals, budgets and ticketing", "Supplier sourcing and bookings"],
    image: "experience-1", alt: "Ballroom set for a corporate conference with stage screens and round tables",
  },
  {
    key: "provider", icon: Store, label: "Provider", title: "List, quote and get booked",
    text: "Publish your venue or services, respond to enquiries and manage bookings and payouts in one place.",
    points: ["Listings with availability rules", "Quotes, enquiries and bookings", "Payouts handled through Stripe"],
    image: "experience-2", alt: "Rooftop restaurant terrace overlooking a city skyline at dusk",
  },
];

const features: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarDays, title: "Event planning", text: "Timelines, run-sheets and tasks your whole team can see and update." },
  { icon: Ticket, title: "Ticketing & check-in", text: "Ticket types, capacity limits, promo codes and guest check-in." },
  { icon: FileText, title: "Proposals & budgets", text: "Build client proposals and track budgets against real bookings." },
  { icon: Search, title: "Supplier marketplace", text: "Search venues and services, request quotes and compare responses." },
  { icon: MessageSquareText, title: "Enquiries & messaging", text: "Keep every conversation tied to the event or booking it belongs to." },
  { icon: Wallet, title: "Payments & payouts", text: "Stripe-hosted checkout for buyers and connected payouts for providers." },
  { icon: Megaphone, title: "Promotion", text: "Public event pages and shareable links to grow your audience." },
  { icon: BarChart3, title: "Reporting", text: "Sales, attendance and booking views to understand what's working." },
];

const security: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: KeyRound, title: "Supabase-backed authentication", text: "Email verification, secure password reset and managed sessions built on Supabase Auth." },
  { icon: Fingerprint, title: "Multi-factor authentication", text: "Protect accounts with a second factor, with step-up checks for sensitive actions." },
  { icon: Layers, title: "Row-level security", text: "Database policies scope every read and write to the workspaces you belong to." },
  { icon: ScrollText, title: "Audit logs", text: "Important changes to workspaces, roles and bookings are recorded for review." },
  { icon: CreditCard, title: "Stripe-hosted payments", text: "Card details are handled by Stripe. Gala Dock never stores full card numbers." },
  { icon: Users, title: "Roles & permissions", text: "Invite teammates with the access they need — owners, admins and members." },
];

const steps: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: UserPlus, title: "Create your account", text: "Sign up once with email. Verify, and add a second factor if you like." },
  { icon: Layers, title: "Choose your experiences", text: "Start as a customer, then add an organizer or provider workspace whenever you need it." },
  { icon: ClipboardList, title: "Set up your workspace", text: "Add your brand, team and listings — Gala Agent can help fill in the details." },
  { icon: Rocket, title: "Go live", text: "Publish events, accept bookings and get paid, all from the same dashboard." },
];

const faqs: FaqItem[] = [
  { q: "Is Gala Dock free to start?", a: "Yes. Creating an account and discovering events is free. Organizer and provider workspaces are free to set up — talk to us about plans for larger teams and higher volumes." },
  { q: "Can one account be a customer, organizer and provider?", a: "Yes. A single Gala Dock account can hold all three experiences. You can switch between them without signing out, and each workspace keeps its own team, data and settings." },
  { q: "How are payments and payouts handled?", a: "Checkout and provider payouts are processed through Stripe. Card details are entered on Stripe-hosted pages, and providers connect their own Stripe account to receive funds." },
  { q: "What does Gala Agent do?", a: "Gala Agent is an AI assistant that helps you shortlist venues, draft budgets, write replies and fill in setup forms. It suggests — you review and approve before anything is saved or sent." },
  { q: "How is my data protected?", a: "Authentication runs on Supabase with optional multi-factor authentication. Row-level security restricts data to the workspaces you belong to, and key changes are written to an audit log." },
  { q: "Can I invite my team?", a: "Yes. Organizer and provider workspaces support team invitations with roles, so each person sees and does only what they should." },
];

const footerCols: { title: string; links: { href: string; label: string }[] }[] = [
  { title: "Platform", links: [{ href: "#platform", label: "Overview" }, { href: "#features", label: "Features" }, { href: "#agent", label: "Gala Agent" }, { href: "#pricing", label: "Pricing" }] },
  { title: "Solutions", links: [{ href: "#experiences", label: "Customers" }, { href: "#organizers", label: "Organizers" }, { href: "#providers", label: "Providers" }, { href: "#how-it-works", label: "How it works" }] },
  { title: "Company", links: [{ href: "/help", label: "Help centre" }, { href: "#security", label: "Security" }, { href: "#faq", label: "FAQ" }] },
  { title: "Account", links: [{ href: "/login", label: "Log in" }, { href: "/register", label: "Create account" }, { href: "/terms", label: "Terms" }, { href: "/privacy", label: "Privacy" }] },
];

function SectionHead({ eyebrow, title, text, id, center = false }: { eyebrow: string; title: ReactNode; text?: string; id: string; center?: boolean }) {
  return (
    <div className={`lp-section-head${center ? " is-center" : ""}`}>
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {text && <p className="lp-lead">{text}</p>}
    </div>
  );
}

function Checks({ items }: { items: string[] }) {
  return <ul className="lp-checks">{items.map(i => <li key={i}><Check size={16} aria-hidden="true" />{i}</li>)}</ul>;
}

export default function Page() {
  const year = new Date().getFullYear();
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <LandingHeader />

      <main id="main">
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-bg" aria-hidden="true" />
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-pill"><Sparkles size={14} aria-hidden="true" />One platform for every side of the event</p>
              <h1 id="hero-title">Plan, run and book <span className="lp-grad">extraordinary events</span></h1>
              <p className="lp-hero-sub">
                Gala Dock brings event discovery, professional event management and venue and supplier bookings together — so customers, organizers and providers can work from one account.
              </p>
              <div className="lp-cta-row">
                <Link className="lp-btn lp-btn-primary lp-btn-lg" href="/register">Get started free<ArrowRight size={18} aria-hidden="true" /></Link>
                <a className="lp-btn lp-btn-secondary lp-btn-lg" href="#platform">Explore the platform</a>
              </div>
              <ul className="lp-hero-meta">
                <li><Check size={15} aria-hidden="true" />Free to start</li>
                <li><Check size={15} aria-hidden="true" />One login, three experiences</li>
                <li><Check size={15} aria-hidden="true" />Stripe-hosted payments</li>
              </ul>
            </div>

            <div className="lp-hero-visual">
              <div className="lp-hero-frame">
                <Image src={img("home-hero")} alt="Guests celebrating under colourful lights at a live event" fill preload sizes="(max-width: 1023px) 100vw, 640px" className="lp-cover" />
              </div>
              <div className="lp-float lp-float-event" aria-hidden="true">
                <div className="lp-float-thumb"><Image src={img("experience-1")} alt="" fill sizes="64px" className="lp-cover" /></div>
                <div>
                  <span className="lp-float-kicker">Event workspace</span>
                  <strong>Annual Partner Summit</strong>
                  <span className="lp-float-bar"><i style={{ width: "72%" }} /></span>
                  <span className="lp-float-muted">Ticket sales · 72% of capacity</span>
                </div>
              </div>
              <div className="lp-float lp-float-booking" aria-hidden="true">
                <span className="lp-float-icon"><BadgeCheck size={18} /></span>
                <div>
                  <strong>Booking confirmed</strong>
                  <span className="lp-float-muted">Riverside terrace · Sat, 14:00</span>
                </div>
              </div>
              <div className="lp-float lp-float-agent" aria-hidden="true">
                <span className="lp-float-icon is-purple"><Sparkles size={16} /></span>
                <span>Gala Agent found 3 venues</span>
              </div>
            </div>
          </div>
          <div className="lp-container">
            <p className="lp-built-for">Built for venues, suppliers and organizers of every size — from private celebrations to multi-day productions.</p>
          </div>
        </section>

        {/* Experiences */}
        <section className="lp-section" id="platform" aria-labelledby="platform-title">
          <div className="lp-container">
            <SectionHead id="platform-title" eyebrow="One account, three experiences" center
              title={<>Everything events need, <span className="lp-grad">in one place</span></>}
              text="Start where you are. Add an organizer or provider workspace whenever you need one — your profile, security settings and history come with you." />
            <div className="lp-exp-grid" id="experiences">
              {experiences.map(e => (
                <article className="lp-exp-card" key={e.key}>
                  <div className="lp-exp-media">
                    <Image src={img(e.image)} alt={e.alt} fill sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 400px" className="lp-cover" />
                    <span className="lp-exp-icon"><e.icon size={20} aria-hidden="true" /></span>
                  </div>
                  <div className="lp-exp-body">
                    <p className="lp-exp-label">{e.label}</p>
                    <h3>{e.title}</h3>
                    <p>{e.text}</p>
                    <Checks items={e.points} />
                    <Link className="lp-text-link" href="/register?next=/onboarding">Continue as {e.label === "Organizer" ? "an" : "a"} {e.label}<ArrowRight size={16} aria-hidden="true" /></Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="lp-section lp-tint" id="features" aria-labelledby="features-title">
          <div className="lp-container">
            <SectionHead id="features-title" eyebrow="Platform features"
              title="The tools behind every great event"
              text="Purpose-built modules that share the same data, so nothing is copied between spreadsheets, inboxes and payment tools." />
            <ul className="lp-feature-grid">
              {features.map(f => (
                <li className="lp-feature" key={f.title}>
                  <span className="lp-icon"><f.icon size={20} aria-hidden="true" /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Organizers */}
        <section className="lp-section" id="organizers" aria-labelledby="organizers-title">
          <div className="lp-container lp-split">
            <div className="lp-split-copy">
              <SectionHead id="organizers-title" eyebrow="For organizers"
                title="Run every event like a professional production"
                text="Bring your team, clients and suppliers into a single workspace. Plan the programme, send proposals, sell tickets and book suppliers without switching tools." />
              <Checks items={["Team workspace with roles and invitations", "Proposals and budgets linked to real bookings", "Ticketing, promo codes and guest check-in", "Source and book venues and suppliers"]} />
              <Link className="lp-btn lp-btn-primary" href="/register?next=/onboarding">Start an organizer workspace<ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="lp-split-visual">
              <div className="lp-split-frame">
                <Image src={img("organizer-hero")} alt="Crowd watching fireworks above a city festival stage" fill sizes="(max-width: 1023px) 100vw, 600px" className="lp-cover" />
              </div>
              <div className="lp-mock lp-mock-stats" aria-hidden="true">
                <p className="lp-mock-title">Event overview</p>
                <div className="lp-mock-row">
                  <div><span>Tickets</span><strong>On sale</strong></div>
                  <div><span>Suppliers</span><strong>4 booked</strong></div>
                  <div><span>Tasks</span><strong>12 open</strong></div>
                </div>
                <div className="lp-mock-chart">{[38, 52, 46, 64, 58, 76, 88].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Providers */}
        <section className="lp-section lp-tint" id="providers" aria-labelledby="providers-title">
          <div className="lp-container lp-split is-reversed">
            <div className="lp-split-copy">
              <SectionHead id="providers-title" eyebrow="For providers"
                title="Turn enquiries into confirmed bookings"
                text="Venues, caterers, entertainers, production crews and more — list what you offer, set your rules and respond to requests from organizers and customers." />
              <Checks items={["Venue and service listings with photos and packages", "Availability, lead times and booking rules", "Quotes and enquiries in one inbox", "Payouts to your connected Stripe account"]} />
              <Link className="lp-btn lp-btn-primary" href="/register?next=/onboarding">List your venue or service<ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="lp-split-visual">
              <div className="lp-split-frame">
                <Image src={img("venue-hero")} alt="Waterfront event venue lit up at night" fill sizes="(max-width: 1023px) 100vw, 600px" className="lp-cover" />
              </div>
              <div className="lp-mock lp-mock-request" aria-hidden="true">
                <p className="lp-mock-title">New booking request</p>
                <div className="lp-mock-line"><span>Event</span><strong>Wedding reception</strong></div>
                <div className="lp-mock-line"><span>Guests</span><strong>140</strong></div>
                <div className="lp-mock-line"><span>Date</span><strong>Saturday, 12 Sep</strong></div>
                <div className="lp-mock-actions"><span className="is-primary">Send quote</span><span>Message</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* Gala Agent */}
        <section className="lp-agent" id="agent" aria-labelledby="agent-title">
          <div className="lp-container lp-agent-grid">
            <div className="lp-agent-copy">
              <p className="lp-eyebrow is-light">Meet Gala Agent</p>
              <h2 id="agent-title">An AI assistant that knows events</h2>
              <p className="lp-lead">Gala Agent helps you move faster at every step — shortlisting venues, drafting budgets, writing replies and completing setup. It works inside your account, with your permissions.</p>
              <ul className="lp-agent-points">
                <li><Sparkles size={16} aria-hidden="true" />Suggestions grounded in your listings, events and bookings</li>
                <li><ShieldCheck size={16} aria-hidden="true" />Human approval before anything is saved or sent</li>
                <li><LockKeyhole size={16} aria-hidden="true" />Respects workspace roles and data boundaries</li>
              </ul>
              <div className="lp-agent-figure" aria-hidden="true">
                <Image src={img("agent-character")} alt="" width={1212} height={1298} sizes="120px" />
              </div>
            </div>
            <AgentDemo />
          </div>
        </section>

        {/* Security */}
        <section className="lp-section" id="security" aria-labelledby="security-title">
          <div className="lp-container">
            <SectionHead id="security-title" eyebrow="Trust & security" center
              title="Security designed in from the start"
              text="Events involve guests, money and contracts. Gala Dock is built on proven infrastructure with access controls at every layer." />
            <ul className="lp-sec-grid">
              {security.map(s => (
                <li className="lp-sec-card" key={s.title}>
                  <span className="lp-icon is-navy"><s.icon size={20} aria-hidden="true" /></span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="lp-section lp-tint" id="how-it-works" aria-labelledby="how-title">
          <div className="lp-container">
            <SectionHead id="how-title" eyebrow="How it works" center title="From sign-up to showtime in four steps" />
            <ol className="lp-steps">
              {steps.map((s, i) => (
                <li className="lp-step" key={s.title}>
                  <div className="lp-step-top">
                    <span className="lp-icon"><s.icon size={20} aria-hidden="true" /></span>
                    <span className="lp-step-num" aria-hidden="true">0{i + 1}</span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section className="lp-section" id="pricing" aria-labelledby="pricing-title">
          <div className="lp-container">
            <SectionHead id="pricing-title" eyebrow="Pricing" center
              title="Start free. Scale when you're ready."
              text="No commitment to get going. When your team or volume grows, we'll put together a plan that fits." />
            <div className="lp-price-grid">
              <article className="lp-price-card">
                <h3>Customers</h3>
                <p className="lp-price">Free</p>
                <p className="lp-price-note">Discover events and book tickets.</p>
                <Checks items={["Browse events, venues and services", "Secure checkout", "Tickets and bookings in one place"]} />
                <Link className="lp-btn lp-btn-secondary lp-btn-block" href="/register">Create account</Link>
              </article>
              <article className="lp-price-card is-featured">
                <span className="lp-price-tag">Most flexible</span>
                <h3>Organizers & providers</h3>
                <p className="lp-price">Free to start</p>
                <p className="lp-price-note">Set up your workspace and go live.</p>
                <Checks items={["Organizer and provider workspaces", "Ticketing, listings and bookings", "Stripe-hosted payments and payouts", "Gala Agent assistance"]} />
                <Link className="lp-btn lp-btn-primary lp-btn-block" href="/register?next=/onboarding">Get started<ArrowRight size={16} aria-hidden="true" /></Link>
              </article>
              <article className="lp-price-card">
                <h3>Teams & enterprise</h3>
                <p className="lp-price">Talk to us</p>
                <p className="lp-price-note">For larger teams and higher volumes.</p>
                <Checks items={["Multiple workspaces and teams", "Advanced roles and audit history", "Onboarding support"]} />
                <Link className="lp-btn lp-btn-secondary lp-btn-block" href="/register">Contact sales</Link>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section lp-tint" id="faq" aria-labelledby="faq-title">
          <div className="lp-container lp-faq">
            <div className="lp-faq-intro">
              <SectionHead id="faq-title" eyebrow="FAQ" title="Questions, answered" text="Can't find what you're looking for? Our help centre has guides for every part of the platform." />
              <Link className="lp-text-link" href="/help">Visit the help centre<ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <Faq items={faqs} />
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-container">
            <div className="lp-final-card">
              <Image src={img("dash-0")} alt="" fill sizes="(max-width: 1279px) 100vw, 1200px" className="lp-cover lp-final-img" />
              <div className="lp-final-content">
                <h2 id="final-title">Ready to make your next event extraordinary?</h2>
                <p>Create your free account in minutes. Add organizer or provider tools whenever you need them.</p>
                <div className="lp-cta-row is-center">
                  <Link className="lp-btn lp-btn-white lp-btn-lg" href="/register">Get started free<ArrowRight size={18} aria-hidden="true" /></Link>
                  <Link className="lp-btn lp-btn-outline-light lp-btn-lg" href="/login">Log in</Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <div className="lp-footer-brand">
              <Logo light />
              <p>One platform to discover, plan, run and book extraordinary events.</p>
            </div>
            <nav className="lp-footer-cols" aria-label="Footer">
              {footerCols.map(col => (
                <div key={col.title}>
                  <h2>{col.title}</h2>
                  <ul>{col.links.map(l => <li key={l.label}>{l.href.startsWith("#") ? <a href={l.href}>{l.label}</a> : <Link href={l.href}>{l.label}</Link>}</li>)}</ul>
                </div>
              ))}
            </nav>
          </div>
          <div className="lp-footer-bottom">
            <p>© {year} Gala Dock. All rights reserved.<br /><small>Gala Dock is a trading name of {LEGAL.entity.name}, registered in England and Wales (company number {LEGAL.entity.number}). Registered office: {LEGAL.entity.address}. VAT number {LEGAL.entity.vat}.</small></p>
            <ul>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><Link href="/help">Help</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
