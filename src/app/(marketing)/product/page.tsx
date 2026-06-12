import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  Users2,
  BarChart3,
  FileText,
  Sparkles,
  Globe,
  ArrowRight,
  CheckCircle2,
  Building2,
  UserCheck,
  Briefcase,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Product — Gala Dock",
  description:
    "Gala Dock is the event delivery operating system for agencies and planners. Learn how it works and who it is built for.",
};

// ── Data ──────────────────────────────────────────────────────────────────────

const WHO_ITS_FOR = [
  {
    icon: Briefcase,
    title: "Event agencies",
    description:
      "Multi-team operations running 20, 50, or 200+ events per year. You need a single source of truth that every team member and supplier can work from.",
  },
  {
    icon: UserCheck,
    title: "Independent planners",
    description:
      "Solo planners and small studios who want to look professional, stay organised, and stop living in spreadsheets and email threads.",
  },
  {
    icon: Building2,
    title: "Venues & in-house teams",
    description:
      "Internal event teams at hotels, universities, corporates and venues who manage a regular calendar of events and need clear workflows.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Set up your workspace",
    description:
      "Create your team, import your supplier register, and configure your event pipeline stages in under 30 minutes. Gala Dock is designed to be production-ready from day one — no lengthy setup or configuration required.",
  },
  {
    step: "02",
    title: "Manage events end-to-end",
    description:
      "Create events, assign team members, build run sheets, raise quotes, and manage supplier relationships — all from a single, structured workspace. The 7-stage pipeline keeps every event progressing cleanly from enquiry to final invoice.",
  },
  {
    step: "03",
    title: "Deliver with confidence",
    description:
      "On event day, switch to Event Day Mode for a live run sheet your whole team can tick off in real time. Gala Copilot AI flags risks before they happen, so you arrive on site prepared for anything.",
  },
];

const MODULES = [
  {
    icon: CalendarDays,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-600",
    title: "Event Pipeline",
    description:
      "A structured 7-stage pipeline from enquiry to sign-off. Kanban and list views. Custom stage configuration.",
  },
  {
    icon: Users2,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Supplier Management",
    description:
      "Centralised register, digital onboarding, insurance tracking, and ratings for your whole supplier network.",
  },
  {
    icon: BarChart3,
    iconBg: "bg-success-50",
    iconColor: "text-success-600",
    title: "Finance Suite",
    description:
      "Quotes, invoices, payment tracking and real-time P&L per event. No more end-of-month reconciliation.",
  },
  {
    icon: FileText,
    iconBg: "bg-warning-50",
    iconColor: "text-warning-600",
    title: "Tasks & Run Sheets",
    description:
      "Team and supplier task assignment with automatic reminders. Live event day run sheet mode.",
  },
  {
    icon: Sparkles,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-600",
    title: "Gala Copilot AI",
    description:
      "Draft briefs and emails, surface next actions, flag risks and gaps — your AI delivery partner.",
  },
  {
    icon: Globe,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Client & Supplier Portals",
    description:
      "Branded client portal for event updates. Supplier portal for digital onboarding and confirmations.",
  },
];

const WHAT_IS_GALA_DOCK = [
  "Gala Dock is an event delivery operating system built specifically for event agencies, independent planners, and venue teams.",
  "Where generic project management tools force you to build your own event workflows from scratch, Gala Dock ships with the structure, terminology and workflows that event professionals already use — pipelines, run sheets, supplier registers, client portals and finance tracking.",
  "Everything that used to live across five or six separate tools — from initial enquiry tracking to final invoice — now lives in one place, with an AI layer that keeps your team one step ahead.",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 to-white pt-20 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold mb-6">
            <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
            The Event Delivery OS
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-900 tracking-tight leading-tight mb-6">
            The platform built
            <br />
            <span className="text-brand-600">for event professionals</span>
          </h1>
          <p className="text-lg sm:text-xl text-surface-500 max-w-2xl mx-auto leading-relaxed mb-10">
            Gala Dock replaces your spreadsheets, email threads and disconnected
            tools with a single, structured operating system for your entire
            event business.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm shadow-lg shadow-brand-600/20"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/book-demo"
              className="flex items-center justify-center gap-2 px-6 py-3 border border-surface-200 text-surface-700 font-medium rounded-xl hover:bg-surface-50 transition-colors text-sm"
            >
              Book a live demo
            </Link>
          </div>
        </div>
      </section>

      {/* What is Gala Dock */}
      <section className="px-6 py-20 border-b border-surface-100">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-6">
              What is Gala Dock?
            </h2>
            <div className="space-y-4">
              {WHAT_IS_GALA_DOCK.map((para, i) => (
                <p key={i} className="text-base text-surface-600 leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {[
                "No setup fee",
                "14-day free trial",
                "Cancel anytime",
              ].map((badge) => (
                <span
                  key={badge}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-success-700 bg-success-50 border border-success-200 rounded-full"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {badge}
                </span>
              ))}
            </div>
          </div>
          <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-surface-200 flex items-center justify-center shadow-card">
            <div className="text-center p-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white shadow-md flex items-center justify-center">
                <CalendarDays className="w-8 h-8 text-brand-600" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-surface-500">
                Gala Dock — Event Delivery OS
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="bg-surface-50 border-b border-surface-200 px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-3">
              Who it is for
            </h2>
            <p className="text-surface-500 max-w-xl mx-auto">
              Gala Dock is built for anyone who runs events professionally —
              from solo planners to large agencies.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WHO_ITS_FOR.map((persona) => {
              const Icon = persona.icon;
              return (
                <div
                  key={persona.title}
                  className="bg-white border border-surface-200 rounded-2xl p-6 shadow-card hover:shadow-lg transition-shadow"
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                    <Icon
                      className="w-5.5 h-5.5 text-brand-600"
                      strokeWidth={1.8}
                    />
                  </div>
                  <h3 className="text-base font-semibold text-surface-900 mb-2">
                    {persona.title}
                  </h3>
                  <p className="text-sm text-surface-600 leading-relaxed">
                    {persona.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 border-b border-surface-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-3">
              How it works
            </h2>
            <p className="text-surface-500">
              From sign-up to delivering your first event, Gala Dock is
              production-ready in minutes.
            </p>
          </div>
          <div className="relative space-y-10">
            {/* Connector line */}
            <div className="absolute left-7 top-10 bottom-10 w-px bg-surface-200 hidden md:block" />
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="flex items-start gap-6">
                <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center shrink-0 font-bold text-lg shadow-lg shadow-brand-600/20 relative z-10">
                  {step.step}
                </div>
                <div className="pt-2">
                  <h3 className="text-lg font-semibold text-surface-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-base text-surface-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key modules */}
      <section className="bg-surface-50 border-b border-surface-200 px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-3">
              Key modules
            </h2>
            <p className="text-surface-500">
              Six tightly integrated modules that work together as a complete
              operating system.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.title}
                  className="bg-white border border-surface-200 rounded-2xl p-5 shadow-card"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${mod.iconBg}`}
                  >
                    <Icon
                      className={`w-5 h-5 ${mod.iconColor}`}
                      strokeWidth={1.8}
                    />
                  </div>
                  <h3 className="text-sm font-semibold text-surface-900 mb-1.5">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-surface-500 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/features"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              Explore all features
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to upgrade your event operation?
          </h2>
          <p className="text-brand-100 mb-8 text-lg">
            Start your free 14-day trial today. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 px-8 py-3 bg-white text-brand-700 font-semibold rounded-xl hover:bg-brand-50 transition-colors text-sm"
            >
              Get started free
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/book-demo"
              className="flex items-center justify-center gap-2 px-8 py-3 border border-brand-400 text-white font-medium rounded-xl hover:bg-brand-700 transition-colors text-sm"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
