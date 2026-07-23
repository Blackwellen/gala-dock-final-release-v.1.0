import type { Metadata } from "next";
import Link from "next/link";
import { Link2, PoundSterling, Network, MousePointerClick, ArrowRight, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Affiliate Programme",
  description: "Earn commission referring event organisers, venues and suppliers to Gala Dock — two-tier, transparent, no cap.",
};

const FEATURES = [
  { icon: MousePointerClick, title: "One referral link", desc: "Share your unique link — every signup and upgrade it drives is tracked automatically." },
  { icon: Network, title: "Two-tier commission", desc: "Earn on people you refer directly, plus an override on conversions from affiliates you recruit." },
  { icon: PoundSterling, title: "Real payouts", desc: "Track pending, approved and paid earnings in your dashboard — paid out via Stripe Connect." },
];

export default function AffiliatePage() {
  return (
    <div className="bg-surface-50">
      <header className="bg-[#0e0c27] text-white">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 text-brand-300 text-xs font-semibold mb-6">
            <Link2 className="w-3.5 h-3.5" strokeWidth={2.5} />
            Affiliate Programme
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Earn commission referring Gala Dock.</h1>
          <p className="mt-4 text-white/70 max-w-xl mx-auto">
            Refer event organisers, venues and suppliers to Gala Dock and earn commission on every
            paid signup — plus an override on conversions from affiliates you recruit.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/affiliate/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              Log in to your affiliate dashboard
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 border border-white/20 hover:bg-white/5 text-white font-medium rounded-xl text-sm transition-colors"
            >
              Create an account to join
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border border-surface-200 bg-white p-6">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                </div>
                <h3 className="font-semibold text-surface-900 mb-2 text-sm">{f.title}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-surface-200 bg-white p-8">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">How it works</h2>
          <ul className="space-y-3">
            {[
              "Sign in (or create a free Gala Dock account) — every account has its own affiliate hub under Settings.",
              "Enrol to get your referral link and, if you want to build a network, a recruit link for sub-affiliates.",
              "Share your link — signups and upgrades are tracked automatically, no manual reporting.",
              "Track clicks, conversions and earnings (pending → approved → paid) directly in your dashboard.",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-brand-50 text-brand-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-surface-600">{step}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 pt-6 border-t border-surface-100 flex items-center gap-2 text-xs text-surface-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-success-600" />
            Read the full <Link href="/legal/affiliate-terms" className="underline hover:text-surface-600">Affiliate Terms</Link>.
          </div>
        </div>
      </div>
    </div>
  );
}
