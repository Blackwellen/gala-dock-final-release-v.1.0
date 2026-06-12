"use client";

import { useState } from "react";
import { Copy, Check, Link2, MousePointerClick, Users, PoundSterling } from "lucide-react";
import { SettingsShell } from "@/components/settings/SettingsShell";

const REFERRAL_LINK = "https://app.galadock.com/ref/GRAND-AFF-2025";

const STEPS = [
  {
    step: "1",
    title: "Share your link",
    description: "Send your unique referral link to event planners and agencies you know.",
  },
  {
    step: "2",
    title: "They sign up",
    description: "When they create a paid Gala Dock account using your link, you earn commission.",
  },
  {
    step: "3",
    title: "You get paid",
    description: "Earn 20% recurring commission for 12 months on every referred workspace.",
  },
];

export default function AffiliateSettingsPage() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(REFERRAL_LINK);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SettingsShell title="Affiliate Programme" description="Earn commission by referring new customers to Gala Dock.">
      <div className="max-w-lg space-y-8">
        {/* Referral link */}
        <div>
          <p className="text-sm font-medium text-surface-700 mb-2">Your referral link</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-sm text-surface-600 font-mono truncate">
              {REFERRAL_LINK}
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-700 bg-white hover:bg-surface-50 border border-surface-200 rounded-lg transition-colors whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-success-600" strokeWidth={2} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" strokeWidth={1.8} />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: MousePointerClick, label: "Clicks", value: "0" },
            { icon: Users, label: "Conversions", value: "0" },
            { icon: PoundSterling, label: "Earned", value: "£0" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white border border-surface-200 rounded-xl shadow-card p-4 text-center">
              <Icon className="w-5 h-5 text-brand-600 mx-auto mb-2" strokeWidth={1.8} />
              <p className="text-2xl font-bold text-surface-900">{value}</p>
              <p className="text-xs text-surface-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="border-t border-surface-100 pt-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">How it works</h2>
          <div className="space-y-4">
            {STEPS.map((s) => (
              <div key={s.step} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                  {s.step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-surface-900">{s.title}</p>
                  <p className="text-sm text-surface-500 mt-0.5">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-3 bg-surface-50 border border-surface-200 rounded-lg p-4">
          <Link2 className="w-4 h-4 text-surface-400 shrink-0 mt-0.5" strokeWidth={1.8} />
          <p className="text-xs text-surface-500">
            Full affiliate programme details, payout schedule, and terms are available in the{" "}
            <a href="/affiliate" className="text-brand-600 hover:underline">Affiliate Programme</a> section.
          </p>
        </div>
      </div>
    </SettingsShell>
  );
}
