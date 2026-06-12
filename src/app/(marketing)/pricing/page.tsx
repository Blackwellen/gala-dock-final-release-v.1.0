import type { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  X,
  ArrowRight,
  ChevronDown,
  Zap,
  Sparkles,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing — Gala Dock",
  description:
    "Simple, transparent pricing for event professionals. Start free, scale as you grow.",
};

// ── Data ──────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Starter",
    icon: Zap,
    price: "£49",
    period: "/mo",
    annual: "£39/mo billed annually",
    description: "For solo planners and small studios.",
    features: [
      "Up to 10 active events",
      "25 suppliers",
      "2 team seats",
      "Finance & invoicing",
      "Client portal",
      "Run sheets",
      "Email support",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Growth",
    icon: Sparkles,
    price: "£149",
    period: "/mo",
    annual: "£119/mo billed annually",
    description: "For growing agencies and multi-team operations.",
    features: [
      "Unlimited events",
      "Unlimited suppliers",
      "10 team seats",
      "Full finance suite",
      "Supplier portal",
      "Gala Copilot AI",
      "Smart Rules & automations",
      "Advanced analytics",
      "Priority support",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Enterprise",
    icon: Building2,
    price: "Custom",
    period: "",
    annual: "Volume & annual discounts",
    description: "For agencies and venues with complex needs.",
    features: [
      "Everything in Growth",
      "Unlimited team seats",
      "Custom branding",
      "SSO / SAML",
      "Dedicated onboarding",
      "SLA & account manager",
      "Custom integrations",
    ],
    cta: "Talk to us",
    href: "/contact",
    highlight: false,
  },
];

const COMPARISON: { feature: string; starter: boolean | string; growth: boolean | string; enterprise: boolean | string }[] = [
  { feature: "Active events", starter: "10", growth: "Unlimited", enterprise: "Unlimited" },
  { feature: "Suppliers", starter: "25", growth: "Unlimited", enterprise: "Unlimited" },
  { feature: "Team seats", starter: "2", growth: "10", enterprise: "Unlimited" },
  { feature: "Event pipeline", starter: true, growth: true, enterprise: true },
  { feature: "Finance & invoicing", starter: true, growth: true, enterprise: true },
  { feature: "Run sheets", starter: true, growth: true, enterprise: true },
  { feature: "Client portal", starter: true, growth: true, enterprise: true },
  { feature: "Supplier portal", starter: false, growth: true, enterprise: true },
  { feature: "Gala Copilot AI", starter: false, growth: true, enterprise: true },
  { feature: "Smart Rules / automations", starter: false, growth: true, enterprise: true },
  { feature: "Advanced analytics", starter: false, growth: true, enterprise: true },
  { feature: "Custom branding", starter: false, growth: false, enterprise: true },
  { feature: "SSO / SAML", starter: false, growth: false, enterprise: true },
  { feature: "SLA & account manager", starter: false, growth: false, enterprise: true },
  { feature: "Support", starter: "Email", growth: "Priority", enterprise: "Dedicated" },
];

const FAQS = [
  {
    q: "Is there a free trial?",
    a: "Yes — every plan starts with a 14-day free trial. No credit card is required to get started. You get full access to the features in your chosen plan during the trial.",
  },
  {
    q: "How does billing work?",
    a: "Plans are billed monthly or annually. Annual billing saves up to 20%. You can switch between monthly and annual at any time from your account settings. All prices are exclusive of VAT.",
  },
  {
    q: "Can I change my plan?",
    a: "Absolutely. You can upgrade or downgrade at any time. Upgrades take effect immediately and you are credited pro-rata for the unused portion of your current plan. Downgrades take effect at the next billing cycle.",
  },
  {
    q: "What happens if I cancel?",
    a: "You can cancel anytime with no penalty. Your subscription will remain active until the end of the billing period. All your data is retained for 30 days after cancellation so you can export it before it is deleted.",
  },
  {
    q: "Do you offer discounts for non-profits or agencies?",
    a: "Yes — we offer a 30% discount for registered charities and non-profit organisations, and volume pricing for agencies managing 20+ events per year. Contact us to find out more.",
  },
];

// ── Components ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
}: {
  plan: (typeof PLANS)[number];
}) {
  const Icon = plan.icon;
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-8 transition-shadow",
        plan.highlight
          ? "bg-brand-600 border-brand-600 shadow-2xl shadow-brand-600/25 scale-[1.02]"
          : "bg-white border-surface-200 shadow-card hover:shadow-lg"
      )}
    >
      {plan.highlight && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 text-xs font-semibold bg-white text-brand-700 rounded-full shadow-md">
            Most popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center mb-4",
            plan.highlight ? "bg-white/20" : "bg-brand-50"
          )}
        >
          <Icon
            className={cn(
              "w-5 h-5",
              plan.highlight ? "text-white" : "text-brand-600"
            )}
            strokeWidth={1.8}
          />
        </div>
        <h3
          className={cn(
            "text-lg font-bold",
            plan.highlight ? "text-white" : "text-surface-900"
          )}
        >
          {plan.name}
        </h3>
        <p
          className={cn(
            "text-sm mt-1",
            plan.highlight ? "text-brand-100" : "text-surface-500"
          )}
        >
          {plan.description}
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "text-4xl font-extrabold tracking-tight",
              plan.highlight ? "text-white" : "text-surface-900"
            )}
          >
            {plan.price}
          </span>
          {plan.period && (
            <span
              className={cn(
                "text-sm font-medium",
                plan.highlight ? "text-brand-100" : "text-surface-500"
              )}
            >
              {plan.period}
            </span>
          )}
        </div>
        <p
          className={cn(
            "text-xs mt-1",
            plan.highlight ? "text-brand-200" : "text-surface-400"
          )}
        >
          {plan.annual}
        </p>
      </div>

      <ul className="flex-1 space-y-3 mb-8">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check
              className={cn(
                "w-4 h-4 mt-0.5 shrink-0",
                plan.highlight ? "text-brand-200" : "text-brand-600"
              )}
              strokeWidth={2.5}
            />
            <span
              className={cn(
                "text-sm",
                plan.highlight ? "text-brand-50" : "text-surface-700"
              )}
            >
              {f}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.href}
        className={cn(
          "flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-colors",
          plan.highlight
            ? "bg-white text-brand-700 hover:bg-brand-50"
            : "bg-brand-600 text-white hover:bg-brand-700"
        )}
      >
        {plan.cta}
        <ArrowRight className="w-4 h-4" strokeWidth={2} />
      </Link>
    </div>
  );
}

function ComparisonRow({
  feature,
  starter,
  growth,
  enterprise,
}: {
  feature: string;
  starter: boolean | string;
  growth: boolean | string;
  enterprise: boolean | string;
}) {
  function Cell({ val }: { val: boolean | string }) {
    if (typeof val === "boolean") {
      return val ? (
        <Check className="w-5 h-5 text-success-600 mx-auto" strokeWidth={2.5} />
      ) : (
        <X className="w-4 h-4 text-surface-300 mx-auto" strokeWidth={2} />
      );
    }
    return (
      <span className="text-sm font-medium text-surface-800 text-center block">
        {val}
      </span>
    );
  }

  return (
    <tr className="border-t border-surface-100 hover:bg-surface-50/60 transition-colors">
      <td className="py-3.5 pr-6 text-sm text-surface-700">{feature}</td>
      <td className="py-3.5 px-4 text-center">
        <Cell val={starter} />
      </td>
      <td className="py-3.5 px-4 text-center bg-brand-50/50">
        <Cell val={growth} />
      </td>
      <td className="py-3.5 pl-4 text-center">
        <Cell val={enterprise} />
      </td>
    </tr>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border border-surface-200 rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none hover:bg-surface-50 transition-colors">
        <span className="text-sm font-semibold text-surface-900">{q}</span>
        <ChevronDown
          className="w-4 h-4 text-surface-400 shrink-0 group-open:rotate-180 transition-transform"
          strokeWidth={2}
        />
      </summary>
      <div className="px-6 pb-5 pt-1">
        <p className="text-sm text-surface-600 leading-relaxed">{a}</p>
      </div>
    </details>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/50 to-white pt-20 pb-16 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold mb-6">
            <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
            14-day free trial · No credit card required
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-surface-900 tracking-tight mb-5">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-surface-500 leading-relaxed">
            One price, all the features. No per-event fees, no hidden add-ons.
            Scale as your team grows.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="px-6 pb-20 -mt-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>
        <p className="text-center text-xs text-surface-400 mt-8">
          All prices exclude VAT. Annual billing available at checkout.
        </p>
      </section>

      {/* Comparison table */}
      <section className="bg-surface-50 border-y border-surface-200 px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-3">
              Compare plans
            </h2>
            <p className="text-surface-500">
              See exactly what is included in each plan.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="py-4 pr-6 text-left text-xs font-semibold text-surface-500 uppercase tracking-wide">
                      Feature
                    </th>
                    <th className="py-4 px-4 text-center text-xs font-semibold text-surface-900">
                      Starter
                    </th>
                    <th className="py-4 px-4 text-center text-xs font-semibold text-brand-700 bg-brand-50/50">
                      Growth
                    </th>
                    <th className="py-4 pl-4 text-center text-xs font-semibold text-surface-900">
                      Enterprise
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <ComparisonRow key={row.feature} {...row} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-3">
              Frequently asked questions
            </h2>
            <p className="text-surface-500">
              Can't find the answer you need?{" "}
              <Link
                href="/contact"
                className="text-brand-600 hover:underline font-medium"
              >
                Contact us
              </Link>
              .
            </p>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">
            Start your free trial today
          </h2>
          <p className="text-brand-100 mb-8 text-lg">
            14 days free. No credit card. Cancel anytime.
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
