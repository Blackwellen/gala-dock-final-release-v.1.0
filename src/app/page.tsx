import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight, BadgeCheck, BarChart3, Briefcase, CalendarDays, Car, Check, ChevronRight, CircleCheck, Clock3, Disc3, ExternalLink,
  FileCheck2, Hammer, Heart, Info, ListChecks, Mail, MapPin, Megaphone, MoreHorizontal, Music2, Pencil, Search, Settings, Share2,
  ShieldCheck, Sparkles, Star, Store, Ticket, Timer, UserRound, Users, UtensilsCrossed, Wallet, type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { LEGAL } from "@/lib/legal";
import { LandingHeader } from "@/components/landing/landing-header";
import { Faq, type FaqItem } from "@/components/landing/faq";
import { Pricing } from "@/components/landing/pricing";
import "@/styles/landing.css";
/* eslint-disable @next/next/no-img-element -- small decorative mock-up thumbnails; next/image adds nothing here */

export const metadata: Metadata = {
  title: "Gala Dock — the connected event platform",
  description: "Plan a celebration or run an event business with one connected system for planning, venues, services, guests, operations and tickets.",
  alternates: { canonical: "/" },
  openGraph: { title: "Gala Dock — the connected event platform", description: "Planning, venues, services, guests, operations and tickets around a single event record.", url: "/", siteName: "Gala Dock", type: "website", images: [{ url: "/assets/regenerated/home-hero.png" }] },
};

/* Every mock-up below is sample data, labelled as such where it could be mistaken for live inventory. */
const START = "/register?next=/plan";
const ORGANIZER = "/register?next=/onboarding/organizer?step=1";
const PROVIDER = "/register?next=/onboarding/provider?step=1";
const ph = (n: string) => `/assets/gd/${n}`;

/** Code-native donut; `parts` are [colour, percent]. */
function Donut({ parts, size, label, sub }: { parts: [string, number][]; size: number; label: string; sub?: string }) {
  const stops = parts.map(([c, p], i) => { const from = parts.slice(0, i).reduce((n, [, v]) => n + v, 0); return `${c} ${from}% ${from + p}%`; }).join(", ");
  return <span className="lp-donut" style={{ "--d": `${size}px`, background: `conic-gradient(${stops})` } as CSSProperties}><span><b>{label}</b>{sub && <small>{sub}</small>}</span></span>;
}
function Tick({ on = false, tone = "blue" }: { on?: boolean; tone?: string }) {
  return on ? <span className={`lp-tick is-on is-${tone}`}><Check size={11} strokeWidth={3} aria-hidden="true" /></span> : <span className="lp-tick" />;
}
function Eyebrow({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return <p className={`lp-eyebrow${center ? " is-center" : ""}`}>{children}</p>;
}
function Checks({ items, tone = "blue" }: { items: string[]; tone?: string }) {
  return <ul className={`lp-checks is-${tone}`}>{items.map(i => <li key={i}><CircleCheck size={18} aria-hidden="true" />{i}</li>)}</ul>;
}
function Avatars({ n = 4, more }: { n?: number; more?: number }) {
  const av = ["av-ava-thompson", "av-james-carter", "av-mia-chen", "av-noah-evans", "av-sophie-malik"];
  return <span className="lp-avatars">{av.slice(0, n).map(a => <img key={a} src={ph(`${a}.webp`)} alt="" />)}{more ? <i>+{more}</i> : null}</span>;
}
function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <li className="lp-mini"><span className="lp-mini-ic"><Icon size={22} aria-hidden="true" /></span><b>{title}</b><small>{text}</small></li>;
}
function Window({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`lp-window ${className}`}><div className="lp-window-dots" aria-hidden="true"><i /><i /><i /></div>{children}</div>;
}

const faqs: FaqItem[] = [
  { q: "Is Gala Dock free to start?", a: "Yes. Creating an account, planning a personal event, discovering events and buying tickets are free. Organizer and provider workspaces start on the free Starter plan; Pro and Business add more events or listings, team members, storage and Gala Agent credits, and Enterprise is tailored to larger teams. Prices are shown above, excluding VAT." },
  { q: "Can one account be a customer, organizer and provider?", a: "Yes. A single Gala Dock account can hold all three. You switch between them without signing out, and each workspace keeps its own team, data and settings." },
  { q: "How are payments and payouts handled?", a: "Checkout and provider payouts are processed through Stripe. Card details are entered on Stripe-hosted pages, and providers connect their own Stripe account to receive funds." },
  { q: "How is my data protected?", a: "Sign-in runs on Supabase Auth with optional multi-factor authentication. Database policies restrict data to the workspaces you belong to, and key changes are written to an audit log." },
];

export default function Page() {
  const year = new Date().getFullYear();
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <LandingHeader />

      <main id="main">
        {/* 1 · The connected event platform */}
        <section className="lp-sec lp-hero" aria-labelledby="hero-title">
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <Eyebrow>The connected event platform</Eyebrow>
              <h1 id="hero-title">One place to bring <br className="lp-br-xl" /><span className="lp-blue">every event</span> together.</h1>
              <p className="lp-lead">Plan a celebration or run an event business with a connected system for planning, venues, services, operations and tickets. Your event remains at the centre, from the first idea to the final guest.</p>
              <div className="lp-cta-row">
                <Link className="lp-btn lp-btn-primary lp-btn-lg" href={START}>Start Planning<ArrowRight size={18} aria-hidden="true" /></Link>
                <a className="lp-btn lp-btn-outline lp-btn-lg" href="#roles">Explore Solutions<ArrowRight size={18} aria-hidden="true" /></a>
              </div>
              <ul className="lp-minis">
                <Feature icon={CalendarDays} title="Plan with confidence" text="Bring ideas, tasks, guests and budgets together." />
                <Feature icon={Users} title="Work with the right people" text="Connect with venues and specialist services." />
                <Feature icon={Ticket} title="Sell and manage tickets" text="Simple or advanced ticketing for any event." />
                <Feature icon={BarChart3} title="Keep everything in sync" text="From planning to on the day and beyond." />
              </ul>
            </div>

            <div className="lp-hv" aria-label="Sample event workspace" role="img">
              <svg className="lp-hv-lines" viewBox="0 0 930 660" aria-hidden="true">
                <path d="M300 160 C 360 160, 380 210, 420 200" /><path d="M640 120 C 610 150, 600 170, 580 190" /><path d="M330 300 C 360 300, 380 260, 400 250" /><path d="M690 300 C 650 280, 630 250, 600 230" />
                <path d="M490 330 L 490 360" /><path d="M490 20 L 490 80" />
                <circle cx="300" cy="160" r="5" className="p" /><circle cx="370" cy="190" r="5" className="g" /><circle cx="608" cy="210" r="5" className="b" /><circle cx="690" cy="300" r="5" className="p" /><circle cx="490" cy="48" r="5" className="r" /><circle cx="490" cy="84" r="5" className="p" />
              </svg>
              <div className="lp-hv-core"><CalendarDays size={30} aria-hidden="true" /><b>Your Event</b><span>Summer Rooftop Party</span><small>Sat 12 Jul 2026</small><Avatars n={4} more={3} /></div>
              <div className="lp-card lp-hv-venue"><header><span className="lp-badge-ic is-purple"><MapPin size={18} /></span><b>Venue</b><MoreHorizontal size={16} /></header>
                <p className="lp-row"><Tick on tone="purple" /><span>Requirements</span><em>3/6</em></p><span className="lp-bar is-purple"><i style={{ width: "50%" }} /></span><p className="lp-row"><Tick /><span>Site visit</span></p></div>
              <div className="lp-card lp-hv-services"><header><span className="lp-badge-ic is-blue"><UtensilsCrossed size={18} /></span><b>Services</b><MoreHorizontal size={16} /></header>
                <p className="lp-row"><Tick on /><span>Catering</span></p><p className="lp-row"><Tick /><span>Entertainment</span><ChevronRight size={14} /></p><p className="lp-row"><Tick /><span>Production</span></p></div>
              <div className="lp-card lp-hv-guests"><header><span className="lp-badge-ic is-green"><Users size={18} /></span><b>Guests</b></header>
                <p className="lp-row"><Tick /><span>Invites</span><em>48/200</em></p><span className="lp-bar"><i style={{ width: "24%" }} /></span><p className="lp-row"><Tick /><span>RSVP tracking</span></p></div>
              <div className="lp-card lp-hv-tickets"><header><span className="lp-badge-ic is-pink"><Ticket size={18} /></span><b>Tickets</b><MoreHorizontal size={16} /></header>
                <p className="lp-row"><Tick on /><span>General Admission</span><ChevronRight size={14} /></p><p className="lp-row"><Tick /><span>VIP Experience</span></p><p className="lp-row"><Tick /><span>Early Bird</span></p></div>
              <div className="lp-card lp-hv-plan">
                <ul className="lp-sidenav">{[["Plan", CalendarDays], ["Build", Hammer], ["Guests", Users], ["Budget", Wallet], ["Tickets", Ticket], ["Timeline", Timer]].map(([l, I], i) => { const Icon = I as LucideIcon; return <li key={l as string} className={i === 0 ? "is-on" : ""}><Icon size={15} />{l as string}</li>; })}</ul>
                <div className="lp-hv-plan-body"><header><b>Event Plan</b><MoreHorizontal size={16} /></header><small>3 of 6 steps complete</small>
                  <p className="lp-row"><span className="lp-bar is-wide"><i style={{ width: "50%" }} /></span><em>50%</em></p>
                  {["Define your event details", "Set venue requirements", "Choose services", "Plan guest experience", "Set up tickets", "Review and launch"].map((s, i) => <p className="lp-row" key={s}><Tick on={i < 2} tone={i === 0 ? "green" : "blue"} /><span>{s}</span></p>)}</div>
              </div>
              <div className="lp-card lp-hv-budget"><header><b>Budget Overview</b><MoreHorizontal size={16} /></header>
                <Donut size={120} label="£12,500" sub="Estimated" parts={[["#1d63f5", 42], ["#f59e0b", 28], ["#f43f5e", 18], ["#2dd4bf", 12]]} />
                <ul className="lp-legend">{[["Venue", "42%", "#1d63f5"], ["Services", "28%", "#f59e0b"], ["Production", "18%", "#f43f5e"], ["Other", "12%", "#2dd4bf"]].map(([l, v, c]) => <li key={l}><i style={{ background: c }} />{l}<em>{v}</em></li>)}</ul></div>
              <div className="lp-card lp-hv-timeline"><header><b>Event Timeline</b><MoreHorizontal size={16} /></header>
                <ol>{[["Planning", "Now – 2 weeks"], ["Build & Confirm", "2 – 6 weeks"], ["Promote", "4 – 8 weeks"], ["Finalise", "1 – 2 weeks"], ["Event Day", "Sat 12 Jul 2026"]].map(([t, s], i) => <li key={t} className={i === 0 ? "is-on" : ""}><span className="lp-tl-dot">{i === 0 ? <Check size={12} strokeWidth={3} /> : i === 4 ? <Star size={12} /> : <CalendarDays size={12} />}</span><b>{t}</b><small>{s}</small></li>)}</ol></div>
              {/* Design slot of the Gala Agent bar (no AI on public pages): a rule-based next-step strip from the plan checklist. */}
              <div className="lp-card lp-hv-next"><span className="lp-badge-ic is-soft-purple"><ListChecks size={20} /></span><p><b>Next step</b><small>Pick up where the plan left off: venue requirements are set.</small></p><span className="lp-hv-next-box"><span>Choose services · step 3 of 6</span><i><ArrowRight size={16} /></i></span></div>
            </div>
          </div>
          <div className="lp-container">
            <div className="lp-flow">
              <div className="lp-flow-steps"><span className="lp-chip"><Sparkles size={14} aria-hidden="true" />Your event at the centre</span>
                <ol>{[["Plan", CalendarDays], ["Source", Search], ["Build", Hammer], ["Guests", Users], ["Sell", Ticket], ["Operate", BarChart3]].map(([l, I]) => { const Icon = I as LucideIcon; return <li key={l as string}><span><Icon size={18} aria-hidden="true" /></span>{l as string}</li>; })}</ol></div>
              <div className="lp-flow-note"><span className="lp-badge-ic is-soft"><Share2 size={20} aria-hidden="true" /></span><p><b>All parts of your event connected</b>Plans, people, services, tickets and finances work together around a single event.</p></div>
            </div>
          </div>
        </section>

        {/* 2 · Built around your role */}
        <section className="lp-sec lp-roles" id="roles" aria-labelledby="roles-title">
          <div className="lp-container">
            <div className="lp-head is-center"><Eyebrow center>Built around your role</Eyebrow>
              <h2 id="roles-title">Whatever your part in an event,<br /><span className="lp-blue">there’s a place for you.</span></h2>
              <p className="lp-lead">Start as an individual, a professional event organizer or a venue and service provider. Choose the interface that matches your actual work.</p></div>
            <div className="lp-role-grid">
              <article className="lp-role is-blue">
                <header><span className="lp-role-ic"><Users size={24} aria-hidden="true" /></span><p><b>Individuals</b>Plan an Event</p></header>
                <div className="lp-role-body"><div><h3>Bring your <span>vision to life.</span></h3><p>Create a plan, organise your guests, manage your budget and keep everything in one place.</p></div>
                  <div className="lp-role-mock is-tilt" aria-hidden="true"><b>Event Plan</b><small>3 of 6 steps complete</small><span className="lp-bar"><i style={{ width: "50%" }} /></span>
                    {["Define event details", "Set budget", "Choose venue requirements", "Add services", "Plan guests & tickets", "Review and launch"].map((s, i) => <p className="lp-row" key={s}><Tick on={i < 2} tone="green" /><span>{s}</span></p>)}</div>
                  <div className="lp-role-pin" aria-hidden="true"><span className="lp-badge-ic is-soft"><CalendarDays size={18} /></span><p><b>Summer Garden Party</b><small>Sat 12 Jul 2026 · London, UK</small></p><Pencil size={14} /></div></div>
                <Link className="lp-btn lp-btn-lg lp-btn-primary lp-role-cta" href={START}>Plan an Event<ArrowRight size={18} aria-hidden="true" /></Link>
              </article>
              <article className="lp-role is-purple">
                <header><span className="lp-role-ic"><Briefcase size={24} aria-hidden="true" /></span><p><b>Event Organizers</b>Run Events Professionally</p></header>
                <div className="lp-role-body"><div><h3>Plan, sell and deliver <span>with confidence.</span></h3><p>Manage multiple events, suppliers, teams, tickets and finances in one professional workspace.</p></div>
                  <div className="lp-role-mock" aria-hidden="true"><header><b>Event Overview</b><span className="lp-pill is-green">Live</span></header>
                    {[["Planning", "12 tasks", ListChecks], ["Suppliers", "5 confirmed", Users], ["Tickets", "On track", Ticket], ["Team", "8 members", UserRound]].map(([t, s, I]) => { const Icon = I as LucideIcon; return <p className="lp-row lp-stat" key={t as string}><span className="lp-badge-ic is-soft-purple"><Icon size={15} /></span><span><b>{t as string}</b><small>{s as string}</small></span></p>; })}
                    <b className="lp-mock-sub">Event Readiness</b><div className="lp-row"><Donut size={74} label="68%" parts={[["#22c55e", 30], ["#6366f1", 20], ["#ec4899", 10], ["#f59e0b", 8], ["#e8ecf7", 32]]} />
                      <ul className="lp-legend">{[["Planning", "#22c55e"], ["Suppliers", "#6366f1"], ["Tickets", "#ec4899"], ["Team", "#f59e0b"]].map(([l, c]) => <li key={l}><i style={{ background: c }} />{l}</li>)}</ul></div></div></div>
                <Link className="lp-btn lp-btn-lg lp-btn-purple lp-role-cta" href={ORGANIZER}>For Organizers<ArrowRight size={18} aria-hidden="true" /></Link>
              </article>
              <article className="lp-role is-orange">
                <header><span className="lp-role-ic"><Store size={24} aria-hidden="true" /></span><p><b>Venues &amp; Providers</b>List and Grow Your Business</p></header>
                <div className="lp-role-body"><div><h3>Showcase your venue <span>or services.</span></h3><p>Create your profile, set your availability, manage enquiries and get ready for the connected event platform.</p></div>
                  <div className="lp-role-mock is-tilt-r" aria-hidden="true"><header><b>Business Profile</b><span className="lp-pill is-green">Ready</span></header>
                    <img src={ph("b-loft.webp")} alt="" />
                    {["Venue details", "Services & packages", "Availability", "Booking rules"].map(s => <p className="lp-row" key={s}><FileCheck2 size={14} /><span>{s}</span><Tick on tone="green" /></p>)}</div>
                  <div className="lp-role-pin is-right" aria-hidden="true"><span className="lp-badge-ic is-orange"><Mail size={18} /></span><p><b>Enquiries</b><small>3 new enquiries</small></p><ChevronRight size={16} /></div></div>
                <Link className="lp-btn lp-btn-lg lp-btn-orange lp-role-cta" href={PROVIDER}>For Providers<ArrowRight size={18} aria-hidden="true" /></Link>
              </article>
            </div>
          </div>
        </section>

        {/* 3 · See how it works */}
        <section className="lp-sec lp-how" id="how-it-works" aria-labelledby="how-title">
          <div className="lp-container">
            <div className="lp-split">
              <div className="lp-split-copy">
                <Eyebrow>See how it works</Eyebrow>
                <h2 id="how-title" className="lp-display">From the first idea <span className="lp-grad">to the final guest.</span></h2>
                <p className="lp-lead">Create the brief, shape a plan, prepare provider requirements, coordinate guests and track costs in one canonical event record.</p>
                <ol className="lp-stepper">{[["Create", "Set your event details and goals", FileCheck2], ["Build", "Plan, budget and shape your event", Hammer], ["Prepare", "Define requirements and coordinate", null], ["Deliver", "Manage guests, run the event and review", Sparkles]].map(([t, s, I], i) => { const Icon = I as LucideIcon | null; return <li key={t as string} className={i === 0 ? "is-on" : ""}><span className="lp-stepper-dot">{Icon ? <Icon size={18} aria-hidden="true" /> : 3}</span><b>{t as string}</b><small>{s as string}</small></li>; })}</ol>
                <div className="lp-cta-row">
                  <Link className="lp-btn lp-btn-primary lp-btn-lg" href={START}>See Event Planning<ArrowRight size={18} aria-hidden="true" /></Link>
                  <a className="lp-btn lp-btn-outline lp-btn-lg" href="#professionals">View Professional Tools<ArrowRight size={18} aria-hidden="true" /></a>
                </div>
              </div>
              <div className="lp-how-visual" role="img" aria-label="Sample event record">
                <Window className="lp-how-win">
                  <div className="lp-app">
                    <aside><span className="lp-app-brand"><Sparkles size={16} />Gala Dock</span><ul className="lp-sidenav">{[["Event", CalendarDays], ["Plan", ListChecks], ["Guests", Users], ["Requirements", FileCheck2], ["Budget", Wallet], ["Timeline", Timer], ["Team", UserRound], ["Notes", Pencil]].map(([l, I], i) => { const Icon = I as LucideIcon; return <li key={l as string} className={i === 0 ? "is-on" : ""}><Icon size={14} />{l as string}</li>; })}</ul></aside>
                    <div className="lp-app-main">
                      <header className="lp-app-head"><img src={ph("ev-rooftop-c.webp")} alt="" /><p><b>Summer Rooftop Party</b><small>Sat 12 Jul 2026 · London, UK</small></p><span className="lp-pill is-amber">Draft</span><span className="lp-ghost-btn"><Pencil size={12} />Edit event</span></header>
                      <nav className="lp-app-tabs"><b>Overview</b><span>Plan</span><span>Guests</span><span>Requirements</span><span>Budget</span><span>Timeline</span></nav>
                      <div className="lp-app-grid">
                        <div className="lp-card lp-how-details"><b>Event details</b><dl>{[["Type", "Private Party"], ["Date", "Sat 12 Jul 2026"], ["Location", "Rooftop Venue, London"], ["Guests", "80 – 120"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><div className="lp-how-img"><img src={ph("me-wedding.webp")} alt="" /><span className="lp-ghost-btn is-wide">Change image</span></div></div>
                        <div className="lp-card"><header><b>Progress</b><MoreHorizontal size={14} /></header><small>1 of 4 stages complete</small><p className="lp-row"><span className="lp-bar is-wide"><i style={{ width: "25%" }} /></span><em>25%</em></p>{["Event details added", "Build your plan", "Add requirements", "Review and launch"].map((s, i) => <p className="lp-row" key={s}><Tick on={i === 0} tone="green" /><span>{s}</span></p>)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="lp-app-grid lp-how-bottom">
                    <div className="lp-card lp-how-budget"><b>Budget (estimate)</b><div className="lp-row"><Donut size={96} label="£12,500" sub="Estimated" parts={[["#1d63f5", 42], ["#ec4899", 28], ["#f59e0b", 18], ["#2dd4bf", 12]]} /><ul className="lp-legend">{[["Venue", "42%", "#1d63f5"], ["Services", "28%", "#ec4899"], ["Production", "18%", "#f59e0b"], ["Other", "12%", "#2dd4bf"]].map(([l, v, c]) => <li key={l}><i style={{ background: c }} />{l}<em>{v}</em></li>)}</ul></div></div>
                    <div className="lp-card"><b>Key dates</b>{[["Planning", "Now – 2 weeks"], ["Requirements", "2 – 4 weeks"], ["Finalise plan", "4 – 6 weeks"], ["Event day", "Sat 12 Jul 2026"]].map(([k, v]) => <p className="lp-row" key={k}><CalendarDays size={13} /><span>{k}</span><em>{v}</em></p>)}</div>
                    <div className="lp-card"><header><b>Activity</b><MoreHorizontal size={14} /></header>{[["Event created", "Today, 10:24"], ["Added event type and date", "Today, 10:28"], ["Set guest estimate", "Today, 10:31"]].map(([k, v]) => <p className="lp-row lp-act" key={k}><Tick on /><span><b>{k}</b><small>{v}</small></span></p>)}</div>
                  </div>
                </Window>
                <ol className="lp-how-rail" aria-hidden="true">{[["Create", "Event details and goals", "blue"], ["Build", "Plan and budget", "purple"], ["Prepare", "Requirements and coordination", "green"], ["Deliver", "Guests, operations and review", "orange"]].map(([t, s, c], i) => <li key={t} className={`is-${c}`}><span>{i + 1}</span><p><b>{t}</b><small>{s}</small></p></li>)}</ol>
              </div>
            </div>
            <ol className="lp-four">
              {[
                { t: "Create your event", s: "Set the occasion, date, location and goals. Everything starts with a single event record.", c: "blue", I: CalendarDays, pts: ["Event type and details", "Guest numbers and location", "Goals and special requirements"] },
                { t: "Build your plan", s: "Organise your ideas, build a timeline and track your budget as your event takes shape.", c: "purple", I: ListChecks, pts: ["Planning timeline", "Budget tracking", "Task lists and milestones"] },
                { t: "Prepare requirements", s: "Define what you need from venues and services, coordinate your team and get everything ready.", c: "green", I: Users, pts: ["Venue and service requirements", "Internal team coordination", "Readiness checklist"] },
                { t: "Deliver and review", s: "Manage guests, run the event and track financials. Keep everything in one place, even after the event.", c: "orange", I: Sparkles, pts: ["Guest management and check-in", "Real-time progress tracking", "Post-event reporting and reviews"] },
              ].map((x, i) => <li key={x.t} className={`lp-four-card is-${x.c}`}><div className="lp-four-ic"><span>{i + 1}</span><i><x.I size={22} aria-hidden="true" /></i></div><div><h3>{x.t}</h3><p>{x.s}</p><Checks items={x.pts} tone={x.c} /></div></li>)}
            </ol>
          </div>
        </section>

        {/* 4 · For event professionals */}
        <section className="lp-sec lp-pro" id="professionals" aria-labelledby="pro-title">
          <div className="lp-container">
            <div className="lp-split">
              <div className="lp-split-copy">
                <Eyebrow>For event professionals</Eyebrow>
                <h2 id="pro-title" className="lp-display">Make complex events feel <span className="lp-grad">under control.</span></h2>
                <p className="lp-lead">Bring portfolios, suppliers, team, schedules, ticket configuration and financial visibility into the same professional workspace.</p>
                <div className="lp-cta-row">
                  <Link className="lp-btn lp-btn-primary lp-btn-lg" href={ORGANIZER}>Organizer Features<ArrowRight size={18} aria-hidden="true" /></Link>
                  <a className="lp-btn lp-btn-outline lp-btn-lg" href="#pricing">View Pricing<ArrowRight size={18} aria-hidden="true" /></a>
                </div>
                <ul className="lp-minis">
                  <Feature icon={CalendarDays} title="Manage multiple events" text="Plan, track and deliver your full portfolio." />
                  <Feature icon={Users} title="Work with your team" text="Roles, tasks and permissions." />
                  <Feature icon={BarChart3} title="Keep finances in view" text="Budgets, payments and reporting." />
                  <Feature icon={Ticket} title="Sell and promote" text="Configure tickets and run campaigns." />
                </ul>
              </div>
              <div className="lp-pro-visual" role="img" aria-label="Sample organizer workspace">
                <span className="lp-pill is-sample">Sample workspace</span>
                <Window className="lp-pro-win">
                  <div className="lp-app">
                    <aside><span className="lp-app-brand"><Sparkles size={16} />Gala Dock</span><span className="lp-app-switch"><span className="lp-badge-ic is-purple"><CalendarDays size={14} /></span><p><b>My Events</b><small>12 events</small></p></span>
                      <ul className="lp-sidenav">{[["Overview", BarChart3], ["Events", CalendarDays], ["Calendar", CalendarDays], ["Suppliers", Users], ["Tickets & Promotion", Ticket], ["Team", UserRound], ["Finances", Wallet], ["Reports", FileCheck2], ["Settings", Settings]].map(([l, I], i) => { const Icon = I as LucideIcon; return <li key={l as string} className={i === 0 ? "is-on" : ""}><Icon size={14} />{l as string}</li>; })}</ul></aside>
                    <div className="lp-app-main">
                      <header className="lp-app-head"><img src={ph("ev-rooftop-c.webp")} alt="" /><p><b>Summer Rooftop Party</b><small>Sat 12 Jul 2026 · London, UK</small></p><span className="lp-pill is-blue">In planning</span><Avatars n={4} more={3} /><span className="lp-ghost-btn"><Share2 size={12} />Share</span></header>
                      <nav className="lp-app-tabs"><b>Overview</b><span>Plan &amp; Source</span><span>Sell &amp; Promote</span><span>Operate &amp; Measure</span></nav>
                      <div className="lp-pro-grid">
                        <img className="lp-pro-photo" src={ph("me-wedding.webp")} alt="" />
                        <div className="lp-card"><b>Event readiness</b><div className="lp-row"><Donut size={92} label="68%" parts={[["#14b8a6", 68], ["#e7edf8", 32]]} /><ul className="lp-mini-list">{["Event details", "Venue requirements", "Suppliers & services", "Tickets & promotion", "Team & operations", "Final checks"].map((s, i) => <li key={s}><Tick on={i < 2} tone={i === 0 ? "green" : "blue"} />{s}</li>)}</ul></div></div>
                        <div className="lp-card"><header><b>Key information</b><em>Edit</em></header>{[["Event type", "Private Event"], ["Expected guests", "80 – 120"], ["Location", "London, UK"], ["Budget (estimate)", "£12,500"]].map(([k, v]) => <p className="lp-kv" key={k}><small>{k}</small><b>{v}</b></p>)}</div>
                        <div className="lp-pro-stats">{[["Budget", "£12,500", "Estimated", "42% spent", "View", "green", 42], ["Suppliers", "5 / 8", "Confirmed", "", "Manage", "purple", 62], ["Tickets", "On track", "Early access setup", "", "Configure", "pink", 55], ["Team", "6 members", "3 active tasks", "", "Manage", "green", 45]].map(([t, v, s, x, a, c, w]) => <div className={`lp-card lp-stat-card is-${c}`} key={t as string}><b>{t as string}</b><strong>{v as string}</strong><small>{s as string}</small><span className="lp-bar"><i style={{ width: `${w}%` }} /></span>{x ? <small>{x as string}</small> : null}<span className="lp-ghost-btn">{a as string}<ArrowRight size={11} /></span></div>)}</div>
                      </div>
                    </div>
                  </div>
                </Window>
              </div>
            </div>
            <div className="lp-three">
              <article className="lp-three-card"><div><p className="lp-kicker"><span className="lp-badge-ic is-soft"><CalendarDays size={16} /></span>01 Plan &amp; Source</p><h3>Plan &amp; Source</h3><p>Build your event, set requirements and prepare your supplier needs.</p><a className="lp-text-link" href="#how-it-works">See how it works<ArrowRight size={16} aria-hidden="true" /></a></div>
                <div className="lp-three-mock" aria-hidden="true"><ul className="lp-mini-list">{["Event brief", "Venue requirements", "Services & suppliers", "Budget planning", "Timeline & run sheet"].map((s, i) => <li key={s}><Tick on={i < 2} tone="green" />{s}</li>)}</ul><img src={ph("b-loft.webp")} alt="" /></div></article>
              <article className="lp-three-card"><div><p className="lp-kicker is-purple"><span className="lp-badge-ic is-soft-purple"><Megaphone size={16} /></span>02 Sell &amp; Promote</p><h3>Sell &amp; Promote</h3><p>Configure tickets, create promotions and track interest as you prepare to go live.</p><Link className="lp-text-link" href="/help/tickets">Explore ticket tools<ArrowRight size={16} aria-hidden="true" /></Link></div>
                <div className="lp-three-mock" aria-hidden="true"><header><b>Ticket setup</b><MoreHorizontal size={14} /></header>{[["General Admission", "£25"], ["VIP Experience", "£75"], ["Early Bird", "£18"]].map(([k, v]) => <p className="lp-row" key={k}><Ticket size={13} /><span>{k}</span><em>{v}</em><i className="lp-toggle" /></p>)}<span className="lp-ghost-btn is-wide">Preview event page<ExternalLink size={11} /></span></div></article>
              <article className="lp-three-card"><div><p className="lp-kicker"><span className="lp-badge-ic is-soft"><BarChart3 size={16} /></span>03 Operate &amp; Measure</p><h3>Operate &amp; Measure</h3><p>Manage your event, track guests, monitor performance and keep finances on target.</p><Link className="lp-text-link" href="/help/event-day-check-in">View reporting<ArrowRight size={16} aria-hidden="true" /></Link></div>
                <div className="lp-three-mock" aria-hidden="true"><b>Live overview (sample)</b><svg viewBox="0 0 200 70" className="lp-spark"><defs><linearGradient id="lpsg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".35" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs><path d="M0 60 L20 50 L35 55 L55 35 L70 45 L90 30 L105 42 L125 22 L140 38 L160 15 L175 32 L200 25 L200 70 L0 70Z" fill="url(#lpsg)" /><path d="M0 60 L20 50 L35 55 L55 35 L70 45 L90 30 L105 42 L125 22 L140 38 L160 15 L175 32 L200 25" fill="none" stroke="#7c3aed" strokeWidth="2" /></svg>
                  <dl className="lp-three-kpis"><div><dt>82</dt><dd>Tickets issued</dd></div><div><dt>68%</dt><dd>Check-in rate</dd></div><div><dt>£8,750</dt><dd>Sales (est.)</dd></div></dl></div></article>
            </div>
          </div>
        </section>

        {/* 5 · Connected marketplace */}
        <section className="lp-sec lp-mkt" id="marketplace" aria-labelledby="mkt-title">
          <div className="lp-container">
            <div className="lp-mkt-grid">
              <div className="lp-split-copy">
                <Eyebrow>Connected marketplace · Preview</Eyebrow>
                <h2 id="mkt-title" className="lp-display">A better way to bring <br className="lp-br-xl" />the right people <br className="lp-br-xl" /><span className="lp-grad">together.</span></h2>
                <p className="lp-lead">Gala Dock connects planning with venues and specialist services. Provider profiles and booking requirements sit right next to your event, so every quote lands where the work happens.</p>
                <div className="lp-cta-row">
                  <Link className="lp-btn lp-btn-primary lp-btn-lg" href={START}>Start Your Event<ArrowRight size={18} aria-hidden="true" /></Link>
                  <Link className="lp-btn lp-btn-outline lp-btn-lg" href={PROVIDER}>List a Venue or Service<ArrowRight size={18} aria-hidden="true" /></Link>
                </div>
                <ul className="lp-mkt-feats">
                  {[[Users, "Verified providers", "Profiles, services and capabilities."], [CalendarDays, "Request and quote flow", "Share requirements and receive responses."], [ShieldCheck, "Built for trust", "Profiles, policies and reviews."], [Sparkles, "Connected to your event", "Keep everything in one place."]].map(([I, t, s]) => { const Icon = I as LucideIcon; return <li key={t as string}><span className="lp-mini-ic"><Icon size={22} aria-hidden="true" /></span><p><b>{t as string}</b><small>{s as string}</small></p></li>; })}
                </ul>
              </div>
              <div className="lp-mkt-cards">
                <div className="lp-card lp-mkt-note"><span className="lp-badge-ic is-purple"><Store size={20} aria-hidden="true" /></span><p><b>Product preview</b>Illustrative sample profiles. Sign in to search live venues and services.</p><Info size={16} aria-hidden="true" /></div>
                {[
                  { kind: "Venue", name: "Riverside Terrace", text: "Stylish rooftop venue with indoor and outdoor space, ideal for private events and celebrations.", img: "me-wedding.webp", pts: [[Users, "Up to 300 guests"], [CalendarDays, "Indoor & outdoor"], [UtensilsCrossed, "Catering options"], [Car, "On-site parking"]] },
                  { kind: "Service", name: "Event Entertainment", text: "Professional DJs, live bands and entertainment for private events, corporate functions and more.", img: "s-elite-sounds.webp", pts: [[Music2, "DJs & live bands"], [Star, "Multiple genres"], [Disc3, "Custom set lists"], [Users, "Event support team"]] },
                ].map(p => <article className="lp-card lp-profile" key={p.name} aria-label={`${p.name} (sample profile)`}><img src={ph(p.img)} alt="" /><span className="lp-heart" aria-hidden="true"><Heart size={16} /></span>
                  <p className="lp-profile-tags"><span className="lp-pill is-plain"><BadgeCheck size={13} />{p.kind}</span><span className={`lp-pill ${p.kind === "Venue" ? "is-lilac" : "is-peach"}`}>Sample profile</span></p>
                  <h3>{p.name}</h3><small>London, UK</small><p>{p.text}</p><ul>{p.pts.map(([I, t]) => { const Icon = I as LucideIcon; return <li key={t as string}><Icon size={16} aria-hidden="true" />{t as string}</li>; })}</ul></article>)}
              </div>
              <ol className="lp-card lp-mkt-steps">
                <li><span className="is-blue">1</span><div><b>Share your requirements</b><small>Tell providers about your event, guest numbers, date, location and what you need.</small>
                  <dl>{[[CalendarDays, "Event date", "Sat 12 Jul 2026"], [Users, "Guest numbers", "80 – 120"], [MapPin, "Location", "London, UK"], [ListChecks, "Services needed", "Venue, Catering, Entertainment"]].map(([I, k, v]) => { const Icon = I as LucideIcon; return <div key={k as string}><dt><Icon size={14} />{k as string}</dt><dd>{v as string}</dd></div>; })}</dl></div></li>
                <li><span className="is-purple">2</span><div><b>Receive and review responses</b><small>Providers send quotes and confirm availability against your requirements.</small>
                  <dl className="lp-mkt-resp">{["Response from venue", "Response from entertainment"].map(k => <div key={k}><dt><Clock3 size={14} />{k}</dt><dd><span className="lp-pill is-blue">Awaiting response</span></dd></div>)}</dl></div></li>
                <li><span className="is-green">3</span><div><b>Compare and move forward</b><small>Review quotes, ask questions and manage everything in your event workspace.</small></div></li>
              </ol>
            </div>
            <div className="lp-flow lp-flow-together">
              <p className="lp-eyebrow">How it comes together</p>
              <ol>{[["Your event", "Create your event and set your requirements.", CalendarDays, "purple"], ["Providers", "Venues and services with verified profiles.", Store, "blue"], ["Requests & responses", "Share details and receive quotes.", Mail, "green"], ["Organise and confirm", "Manage your bookings in one place.", Check, "orange"]].map(([t, s, I, c]) => { const Icon = I as LucideIcon; return <li key={t as string}><span className={`lp-round is-${c}`}><Icon size={20} aria-hidden="true" /></span><p><b>{t as string}</b><small>{s as string}</small></p></li>; })}</ol>
            </div>
          </div>
        </section>

        {/* Pricing — live from plan_prices / plan_entitlements / credit_packs (src/components/landing/pricing.tsx). */}
        <Pricing />

        <section className="lp-sec lp-faqs" aria-labelledby="faq-title">
          <div className="lp-container lp-faq-wrap">
            <h2 id="faq-title">Questions</h2>
            <Faq items={faqs} />
          </div>
        </section>

        {/* 6 · Your next event starts here */}
        <section className="lp-sec lp-cta" aria-labelledby="cta-title">
          <div className="lp-container">
            <div className="lp-head is-center"><Eyebrow center>Your next event starts here</Eyebrow>
              <h2 id="cta-title">One idea can become <span className="lp-grad">something extraordinary.</span></h2>
              <p className="lp-lead">Begin with a plan, establish your organizer workspace or prepare your provider business for the connected event platform.</p></div>
            <div className="lp-cta-grid">
              <article className="lp-cta-card is-blue"><header><span className="lp-role-ic"><Users size={24} aria-hidden="true" /></span><p><small>Individuals</small><b>Plan Your Event</b></p></header>
                <div className="lp-cta-body"><div><p>Create a plan, organise your ideas, manage your guests and keep everything in one place.</p><Checks items={["Event planning tools", "Guest and budget management", "Save and continue anytime"]} /></div>
                  <div className="lp-cta-mock" aria-hidden="true"><b>My Event Plan</b>{["Event details", "Budget plan", "Guest list", "Next steps"].map((s, i) => <p className="lp-row" key={s}><Tick on={i === 0} />{s}</p>)}</div></div>
                <Link className="lp-btn lp-btn-lg lp-btn-primary lp-role-cta" href={START}>Plan Your Event<ArrowRight size={18} aria-hidden="true" /></Link></article>
              <article className="lp-cta-card is-purple"><header><span className="lp-role-ic"><Briefcase size={24} aria-hidden="true" /></span><p><small>Organizers</small><b>Run Events</b></p></header>
                <div className="lp-cta-body"><div><p>Manage multiple events, suppliers, teams, tickets and finances in a professional workspace.</p><Checks tone="purple" items={["Event and team management", "Ticketing and promotion tools", "Financial visibility and reporting"]} /></div>
                  <div className="lp-cta-mock is-split" aria-hidden="true"><div><p className="lp-row"><CalendarDays size={13} /><span><b>Events</b><small>12 active</small></span><BarChart3 size={16} /></p><p className="lp-row"><Users size={13} /><span><b>Team</b><small>8 members</small></span><Avatars n={3} more={5} /></p></div><div><p className="lp-row"><Wallet size={13} /><b>Revenue (est.)</b></p><svg viewBox="0 0 120 34" className="lp-spark"><path d="M0 30 L15 24 L28 27 L42 16 L56 20 L70 10 L84 18 L98 6 L120 12" fill="none" stroke="#7c3aed" strokeWidth="2" /></svg></div></div></div>
                <Link className="lp-btn lp-btn-lg lp-btn-purple lp-role-cta" href={ORGANIZER}>Run Events<ArrowRight size={18} aria-hidden="true" /></Link></article>
              <article className="lp-cta-card is-orange"><header><span className="lp-role-ic"><Store size={24} aria-hidden="true" /></span><p><small>Venues &amp; Providers</small><b>List Your Business</b></p></header>
                <div className="lp-cta-body"><div><p>Create your venue or service profile, set your availability and be ready for the connected marketplace.</p><Checks tone="orange" items={["Venue or service profile", "Showcase your offerings", "Manage enquiries and availability"]} /></div>
                  <div className="lp-cta-mock" aria-hidden="true"><img src={ph("b-loft.webp")} alt="" /><header><b>Venue Profile</b><span className="lp-pill is-green">Ready</span></header>{["Details", "Services & packages", "Availability", "Policies"].map(s => <p className="lp-row" key={s}><FileCheck2 size={12} /><span>{s}</span><Tick on tone="green" /></p>)}</div></div>
                <Link className="lp-btn lp-btn-lg lp-btn-orange lp-role-cta" href={PROVIDER}>List Your Business<ArrowRight size={18} aria-hidden="true" /></Link></article>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-top">
            <div className="lp-footer-brand"><Logo light /><p>The connected event platform for planning, venues, services, operations and tickets.</p></div>
            <nav className="lp-footer-cols" aria-label="Footer">
              {[
                { t: "Product", l: [["#how-it-works", "Event Planning"], ["#professionals", "For Organizers"], ["#marketplace", "For Providers"], ["#pricing", "Pricing"]] },
                { t: "Company", l: [["/help#contact", "Contact"], ["/help/security-mfa", "Security"], ["/help/privacy-data", "Privacy & data"]] },
                { t: "Resources", l: [["/help", "Help Centre"], ["/help/getting-started-organizers", "Guides"], ["/help/developers-api", "Developers"]] },
                { t: "Legal", l: [["/terms", "Terms"], ["/privacy", "Privacy"], ["/cookies", "Cookies"], ["/ticket-terms", "Ticket terms"]] },
              ].map(col => <div key={col.t}><h2>{col.t}</h2><ul>{col.l.map(([href, label]) => <li key={label}>{href.startsWith("#") ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>}</li>)}</ul></div>)}
            </nav>
          </div>
          <div className="lp-footer-bottom">
            <p>© {year} Gala Dock. All rights reserved.<br /><small>Gala Dock is a trading name of {LEGAL.entity.name}, registered in England and Wales (company number {LEGAL.entity.number}). Registered office: {LEGAL.entity.address}. VAT number {LEGAL.entity.vat}.</small></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
