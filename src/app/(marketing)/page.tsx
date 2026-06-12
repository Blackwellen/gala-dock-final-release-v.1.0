import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Star,
  Zap,
  Shield,
  BarChart3,
  Users2,
  CalendarDays,
  FileText,
  Sparkles,
  Quote,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Gala Dock — Event Delivery OS for Agencies & Planners",
  description:
    "The all-in-one platform for event planners, agencies, and venues. Manage events, suppliers, tasks, finance and client communication in one place.",
};

// ── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: CalendarDays,
    title: "End-to-end Event Management",
    description:
      "Build and run events through a structured 7-stage pipeline — from first enquiry to final sign-off.",
  },
  {
    icon: Users2,
    title: "Supplier Register & Onboarding",
    description:
      "Store every supplier, track their documents, insurance and quotes. Send digital onboarding in one click.",
  },
  {
    icon: FileText,
    title: "Finance & Profitability",
    description:
      "Raise quotes, generate invoices and track payments. See your true P&L on every event in real time.",
  },
  {
    icon: BarChart3,
    title: "Tasks & Run Sheets",
    description:
      "Assign tasks by event, team member or supplier. Build run sheets that update live on event day.",
  },
  {
    icon: Sparkles,
    title: "Gala Copilot AI",
    description:
      "Your AI delivery partner — drafts event briefs, answers queries, flags risks and surfaces next actions.",
  },
  {
    icon: Shield,
    title: "Client & Supplier Portals",
    description:
      "Give clients a branded view of their event. Let suppliers confirm details, upload docs and sign off.",
  },
];

const STATS = [
  { value: "3,200+", label: "Events delivered" },
  { value: "94%", label: "On-time delivery rate" },
  { value: "£180M+", label: "Finance managed" },
  { value: "4.9 / 5", label: "Average user rating" },
];

const TESTIMONIALS = [
  {
    quote:
      "Gala Dock replaced five tools for our agency. The supplier register and run sheet alone saved us eight hours per event.",
    name: "Sophie Carter",
    role: "MD, Carter Events Agency",
  },
  {
    quote:
      "We went from spreadsheets to a fully tracked pipeline in two weeks. Our clients love the portal — we look so much more professional.",
    name: "James Thornton",
    role: "Senior Planner, Meridian Events",
  },
  {
    quote:
      "The finance module is exactly what we needed. Quotes, invoices, payments all in one place. Our accountant is happy too.",
    name: "Priya Shah",
    role: "Founder, Bloom & Co. Events",
  },
];

const PRICING = [
  {
    name: "Starter",
    price: "£49",
    period: "/mo",
    description: "For solo planners and small studios.",
    features: [
      "Up to 10 active events",
      "25 suppliers",
      "2 team seats",
      "Finance & invoicing",
      "Client portal",
      "Email support",
    ],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Growth",
    price: "£149",
    period: "/mo",
    description: "For growing agencies and multi-team operations.",
    features: [
      "Unlimited events",
      "Unlimited suppliers",
      "10 team seats",
      "Full finance suite",
      "Supplier portal",
      "Gala Copilot AI",
      "Smart Rules",
      "Priority support",
    ],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For agencies and venues with complex needs.",
    features: [
      "Everything in Growth",
      "Unlimited team seats",
      "Custom branding",
      "SSO / SAML",
      "Dedicated onboarding",
      "SLA & account manager",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

// ── Sections ──────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pt-20 pb-24 px-6">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-50/60 via-white to-violet-50/40 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold mb-6">
          <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
          V1 now live — start your free trial today
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-surface-900 tracking-tight leading-[1.1] mb-6">
          The Event Delivery OS
          <br />
          <span className="text-brand-600">built for professionals</span>
        </h1>

        <p className="text-lg sm:text-xl text-surface-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Gala Dock brings your entire event operation into one platform — from first enquiry to
          final invoice, with AI that keeps you one step ahead.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
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

        <p className="mt-4 text-xs text-surface-400">
          14-day free trial · No credit card required · Cancel anytime
        </p>

        {/* Hero image placeholder */}
        <div className="mt-16 mx-auto max-w-4xl rounded-2xl border border-surface-200 shadow-2xl shadow-surface-900/10 overflow-hidden bg-surface-50">
          <div className="bg-white border-b border-surface-200 px-4 py-3 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-surface-200" />
              <div className="w-3 h-3 rounded-full bg-surface-200" />
              <div className="w-3 h-3 rounded-full bg-surface-200" />
            </div>
            <div className="flex-1 mx-4 h-5 bg-surface-100 rounded-full" />
          </div>
          <div className="aspect-[16/8] bg-gradient-to-br from-surface-50 to-brand-50 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white shadow-md flex items-center justify-center">
                <Image
                  src="/gala-dock-favicon.png"
                  alt="Gala Dock"
                  width={40}
                  height={40}
                  className="object-contain"
                />
              </div>
              <p className="text-sm font-medium text-surface-500">Gala Dock — Event Delivery OS</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="bg-surface-900 py-14 px-6">
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {STATS.map((s) => (
          <div key={s.label}>
            <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
            <div className="text-sm text-surface-400">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="py-20 px-6 bg-white" id="features">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-4">
            Everything your event business needs
          </h2>
          <p className="text-surface-500 text-lg max-w-xl mx-auto">
            One platform for your entire operation — no more jumping between spreadsheets, email
            threads and disconnected tools.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="p-6 rounded-2xl border border-surface-200 hover:border-brand-200 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 group-hover:bg-brand-100 flex items-center justify-center mb-4 transition-colors">
                  <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                </div>
                <h3 className="font-semibold text-surface-900 mb-2">{f.title}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-20 px-6 bg-surface-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-surface-900 tracking-tight mb-4">
            Trusted by event professionals
          </h2>
          <div className="flex items-center justify-center gap-1 text-yellow-400 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-current" strokeWidth={0} />
            ))}
          </div>
          <p className="text-surface-500">4.9 / 5 from 320+ reviews</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-white rounded-2xl border border-surface-200 p-6 shadow-card">
              <Quote className="w-8 h-8 text-brand-200 mb-4" strokeWidth={1.5} />
              <p className="text-surface-700 text-sm leading-relaxed mb-5">{t.quote}</p>
              <div>
                <div className="font-semibold text-surface-900 text-sm">{t.name}</div>
                <div className="text-xs text-surface-400 mt-0.5">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="py-20 px-6 bg-white" id="pricing">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 tracking-tight mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-surface-500 text-lg max-w-xl mx-auto">
            Start free for 14 days. No credit card required. Upgrade or cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PRICING.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-7 ${
                plan.highlight
                  ? "border-brand-600 shadow-xl shadow-brand-600/10 relative"
                  : "border-surface-200"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand-600 text-white text-xs font-semibold rounded-full">
                  Most popular
                </div>
              )}
              <div className="mb-5">
                <h3 className="font-semibold text-surface-900 text-base mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold text-surface-900">{plan.price}</span>
                  {plan.period && <span className="text-surface-400 text-sm">{plan.period}</span>}
                </div>
                <p className="text-sm text-surface-500">{plan.description}</p>
              </div>

              <ul className="space-y-2.5 mb-7">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckCircle2
                      className="w-4 h-4 text-brand-600 mt-0.5 shrink-0"
                      strokeWidth={2}
                    />
                    <span className="text-sm text-surface-600">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.name === "Enterprise" ? "/contact" : "/signup"}
                className={`block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
                    : "border border-surface-200 hover:bg-surface-50 text-surface-700"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="py-20 px-6 bg-gradient-to-br from-brand-600 to-violet-700">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
          Ready to run better events?
        </h2>
        <p className="text-brand-200 text-lg mb-8">
          Join thousands of planners, agencies and venues who use Gala Dock to deliver
          extraordinary events — every time.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-brand-50 text-brand-700 font-semibold rounded-xl text-sm transition-colors shadow-lg"
          >
            Start your free trial
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
          <Link
            href="/book-demo"
            className="flex items-center gap-2 px-6 py-3 border border-brand-400/50 hover:bg-brand-700/40 text-white font-medium rounded-xl text-sm transition-colors"
          >
            Book a demo
          </Link>
        </div>
        <p className="mt-4 text-brand-300 text-xs">14-day free trial · No credit card required</p>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <TestimonialsSection />
      <PricingSection />
      <CtaSection />
    </>
  );
}
