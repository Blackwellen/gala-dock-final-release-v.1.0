import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Minus,
  Sparkles,
  Shield,
  BarChart3,
  Users2,
  CalendarDays,
  FileText,
  Inbox,
  Workflow,
  Wallet,
  ClipboardList,
  X,
} from "lucide-react";

// The V1 default homepage — "Event Delivery OS" positioning. Rendered when the
// publicEventsDirectory flag is off (ticket sales / event discovery not enabled for this
// deployment). No Events/Tickets CTAs, no fabricated customer logos or invented stats —
// every module named below maps to a real, shipped /event-manager section.

const MODULES = [
  { icon: CalendarDays, label: "Events", desc: "Manage enquiries, proposals and event lifecycle" },
  { icon: BarChart3, label: "Sales", desc: "Create proposals, manage stages, close more deals" },
  { icon: Wallet, label: "Finance", desc: "Invoicing, budgets and financial oversight" },
  { icon: Users2, label: "Suppliers", desc: "Find, book and manage trusted supplier partners" },
  { icon: ClipboardList, label: "Tasks", desc: "Assign tasks, track deadlines and keep on track" },
  { icon: Inbox, label: "Inbox", desc: "Centralised communication across every event" },
  { icon: Workflow, label: "Automations", desc: "Automate workflows and save hours every week" },
  { icon: CalendarDays, label: "Calendar", desc: "Unified schedule across teams, venues and events" },
  { icon: FileText, label: "Reporting", desc: "Real-time insights to make smarter decisions" },
];

const CAPABILITIES = [
  { label: "End-to-end event lifecycle", galaDock: true, generic: false, sheets: false },
  { label: "AI-powered proposals & estimates", galaDock: true, generic: false, sheets: false },
  { label: "Integrated ticketing (optional)", galaDock: true, generic: false, sheets: false },
  { label: "Supplier & resource management", galaDock: true, generic: false, sheets: false },
  { label: "Real-time collaboration", galaDock: true, generic: true, sheets: false },
  { label: "Automations & workflows", galaDock: true, generic: false, sheets: false },
  { label: "Advanced reporting & insights", galaDock: true, generic: true, sheets: false },
  { label: "Built for events", galaDock: true, generic: false, sheets: false },
];

const AUDIENCES = [
  { label: "Agencies", desc: "Run multiple client events seamlessly and profitably.", href: "/use-cases/agencies" },
  { label: "Venues", desc: "Maximise bookings and streamline operations.", href: "/use-cases/venues" },
  { label: "Promoters", desc: "Deliver high-impact events that fans love.", href: "/features" },
  { label: "Event Planners", desc: "Plan with confidence and delight every client.", href: "/use-cases/event-planners" },
];

function InfoBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/70 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
      <div className={compact ? "flex-1" : "flex-1"}>
        <p className="text-sm font-medium text-brand-900">
          {compact
            ? "Need public ticket sales and event discovery?"
            : "Public ticket sales and event discovery are currently disabled."}
        </p>
        <p className="text-sm text-brand-700 mt-0.5">
          {compact
            ? "You can enable public ticketing, event discovery and marketing features anytime."
            : "You can enable them anytime when you're ready to go public."}
        </p>
      </div>
      <Link
        href="/pricing"
        className="shrink-0 px-4 py-2 rounded-lg border border-brand-300 bg-white text-brand-700 text-sm font-semibold hover:bg-brand-50 transition-colors whitespace-nowrap"
      >
        Learn more
      </Link>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pt-20 pb-14 px-6">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-50/60 via-white to-violet-50/40 pointer-events-none" />

      <div className="relative max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
          The Event Delivery OS
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-900 tracking-tight leading-[1.1] mb-6">
          Run every event.
          <br />
          <span className="text-brand-600">From first enquiry to final invoice.</span>
        </h1>

        <p className="text-lg text-surface-500 max-w-xl mx-auto mb-9 leading-relaxed">
          Gala Dock brings your entire event operation into one intelligent platform — so your team
          can plan faster, collaborate better, and deliver unforgettable events.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
          <Link
            href="/signup"
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-brand-600/20"
          >
            Start free trial
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
          <Link
            href="/book-demo"
            className="flex items-center gap-2 px-6 py-3 border border-surface-200 hover:bg-surface-50 text-surface-700 font-medium rounded-xl text-sm transition-colors"
          >
            Book a demo
          </Link>
        </div>

        <p className="mb-10 text-xs text-surface-400">
          14-day free trial · No credit card required · Cancel anytime
        </p>

        <div className="text-left">
          <InfoBanner />
        </div>
      </div>
    </section>
  );
}

function DashboardShowcaseSection() {
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-brand-600 text-sm font-semibold mb-2">The all-in-one platform for event professionals</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-4">
            One platform. Every part of the operation.
          </h2>
          <p className="text-surface-500 leading-relaxed mb-6">
            Gala Dock unifies teams, data and tools across the entire event lifecycle. From proposals
            and planning to ticketing, finance, suppliers and reporting — all in one place.
          </p>
          <ul className="space-y-3">
            {[
              "Built for agencies, venues, promoters and event planners",
              "AI-powered workflows and intelligent automation",
              "Real-time collaboration across your entire team",
              "Flexible modules — use what you need, when you need it",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" strokeWidth={2} />
                <span className="text-sm text-surface-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Illustrative dashboard mockup — labels only, no fabricated live figures */}
        <div className="rounded-2xl border border-surface-200 shadow-2xl shadow-surface-900/10 overflow-hidden bg-surface-50">
          <div className="bg-white border-b border-surface-200 px-4 py-3 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-surface-200" />
              <div className="w-3 h-3 rounded-full bg-surface-200" />
              <div className="w-3 h-3 rounded-full bg-surface-200" />
            </div>
            <div className="flex-1 mx-4 h-5 bg-surface-100 rounded-full" />
          </div>
          <div className="p-5 bg-white">
            <p className="text-sm font-semibold text-surface-900 mb-1">Good morning 👋</p>
            <p className="text-xs text-surface-400 mb-4">Here&apos;s what&apos;s happening across your workspace</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {["Enquiries", "Proposals", "Confirmed Events", "Revenue (YTD)"].map((label) => (
                <div key={label} className="rounded-xl border border-surface-200 p-3">
                  <p className="text-[11px] text-surface-400 mb-1.5">{label}</p>
                  <div className="h-2 w-10 rounded-full bg-brand-100" />
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-surface-200 p-3">
              <p className="text-[11px] font-semibold text-surface-500 mb-2">My Events</p>
              <div className="space-y-2">
                {["Summer Music Festival", "Tech Summit 2024", "Corporate Gala Dinner"].map((e) => (
                  <div key={e} className="flex items-center justify-between text-xs">
                    <span className="text-surface-700">{e}</span>
                    <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 text-[10px] font-medium">
                      In progress
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModuleGridSection() {
  return (
    <section className="py-20 px-6 bg-surface-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-4">
          <p className="text-brand-600 text-sm font-semibold mb-2">Modular by design</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-3">
            Everything you need. Only what you use.
          </h2>
          <p className="text-surface-500 max-w-xl mx-auto">
            Enable the modules that fit your workflow today — and scale as your business grows.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 my-12">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="rounded-2xl border border-surface-200 bg-white p-5 hover:border-brand-200 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                </div>
                <h3 className="font-semibold text-surface-900 text-sm mb-1">{m.label}</h3>
                <p className="text-xs text-surface-500 leading-relaxed">{m.desc}</p>
              </div>
            );
          })}
        </div>

        <InfoBanner compact />
      </div>
    </section>
  );
}

function AIProposalSection() {
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-brand-600 text-sm font-semibold mb-2">AI that works for you</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-4">
            Less busywork. More impact.
          </h2>
          <p className="text-surface-500 leading-relaxed mb-6">
            Gala Copilot helps you create proposals, estimate costs, draft timelines and automate
            repetitive tasks — so your team can focus on delivering exceptional events.
          </p>
          <ul className="space-y-3">
            {[
              "AI proposal and quote generation",
              "Smart cost estimation and budgeting",
              "Automated follow-ups and reminders",
              "Intelligent insights and recommendations",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" strokeWidth={2} />
                <span className="text-sm text-surface-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-surface-200 bg-surface-50 p-5 shadow-lg shadow-surface-900/5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-brand-600" />
            <p className="text-sm font-semibold text-surface-900">AI Proposal Builder</p>
          </div>
          <div className="space-y-3">
            {["Event type", "Event date", "Location", "Guest count"].map((label) => (
              <div key={label}>
                <p className="text-[11px] text-surface-400 mb-1">{label}</p>
                <div className="h-8 rounded-lg border border-surface-200 bg-white" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold">
            Generate proposal
          </div>
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section className="py-20 px-6 bg-surface-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-surface-900 tracking-tight text-center mb-12">
          Built for every type of event business
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {AUDIENCES.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="group rounded-2xl border border-surface-200 bg-white overflow-hidden hover:shadow-md hover:border-brand-200 transition-all"
            >
              <div className="h-24 bg-gradient-to-br from-brand-600/90 to-violet-700/90" />
              <div className="p-4">
                <h3 className="font-semibold text-surface-900 text-sm mb-1">{a.label}</h3>
                <p className="text-xs text-surface-500 leading-relaxed mb-2">{a.desc}</p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 group-hover:gap-1.5 transition-all">
                  Learn more <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_1.4fr] gap-12 items-start">
        <div>
          <p className="text-brand-600 text-sm font-semibold mb-2">Why teams choose Gala Dock</p>
          <h2 className="text-3xl font-bold text-surface-900 tracking-tight mb-5">
            Purpose-built for event delivery
          </h2>
          <ul className="space-y-3">
            {[
              "Modern, intuitive and easy to adopt",
              "Flexible modules that scale with you",
              "Secure, reliable and enterprise ready",
              "World-class support when you need it",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" strokeWidth={2} />
                <span className="text-sm text-surface-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left font-medium text-surface-500 px-4 py-3">Capabilities</th>
                  <th className="font-semibold text-brand-700 px-4 py-3 bg-brand-50">Gala Dock</th>
                  <th className="font-medium text-surface-500 px-4 py-3">Generic Tools</th>
                  <th className="font-medium text-surface-500 px-4 py-3">Spreadsheets</th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-surface-50/50"}>
                    <td className="px-4 py-3 text-surface-700">{row.label}</td>
                    <td className="px-4 py-3 text-center bg-brand-50/50">
                      {row.galaDock ? (
                        <CheckCircle2 className="w-4 h-4 text-brand-600 mx-auto" strokeWidth={2} />
                      ) : (
                        <Minus className="w-4 h-4 text-surface-300 mx-auto" strokeWidth={2} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.generic ? (
                        <CheckCircle2 className="w-4 h-4 text-surface-400 mx-auto" strokeWidth={2} />
                      ) : (
                        <X className="w-4 h-4 text-surface-300 mx-auto" strokeWidth={2} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.sheets ? (
                        <CheckCircle2 className="w-4 h-4 text-surface-400 mx-auto" strokeWidth={2} />
                      ) : (
                        <X className="w-4 h-4 text-surface-300 mx-auto" strokeWidth={2} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-5xl mx-auto rounded-2xl bg-gradient-to-br from-brand-600 to-violet-700 px-8 py-12 sm:px-12">
        <div className="max-w-lg">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-3">Ready to run better events?</h2>
          <p className="text-brand-200 mb-8 leading-relaxed">
            Join event professionals using Gala Dock to save time, win more business and deliver
            exceptional experiences.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-brand-50 text-brand-700 font-semibold rounded-xl text-sm transition-colors shadow-lg"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/book-demo"
              className="flex items-center justify-center gap-2 px-6 py-3 border border-brand-400/50 hover:bg-brand-700/40 text-white font-medium rounded-xl text-sm transition-colors"
            >
              Book a demo
            </Link>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-brand-200">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> 14-day free trial</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> No credit card required</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Cancel anytime</span>
        </div>
      </div>
    </section>
  );
}

export function DisabledHome() {
  return (
    <>
      <HeroSection />
      <DashboardShowcaseSection />
      <ModuleGridSection />
      <AIProposalSection />
      <AudienceSection />
      <ComparisonSection />
      <CtaSection />
    </>
  );
}
