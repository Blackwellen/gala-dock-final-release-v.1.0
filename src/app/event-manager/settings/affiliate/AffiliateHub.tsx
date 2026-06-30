"use client";

import { useState } from "react";
import { Copy, Check, MousePointerClick, Users, PoundSterling, Network, UserPlus, Layers } from "lucide-react";

export interface SubAffiliate {
  id: string;
  name: string;
  overrideRatePct: number;
  earnedCents: number;
}

export interface AffiliateHubData {
  enrolled: boolean;
  referralLink: string;
  recruitLink: string;
  overrideRatePct: number;
  clicks: number;
  conversions: number;
  directEarnedCents: number;
  overrideEarnedCents: number;
  subAffiliates: SubAffiliate[];
}

function gbp(cents: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(
    cents / 100
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-sm font-medium text-surface-700 mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-sm text-surface-600 font-mono truncate">
          {value}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-700 bg-white hover:bg-surface-50 border border-surface-200 rounded-lg transition-colors whitespace-nowrap"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-success-600" strokeWidth={2} /> Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" strokeWidth={1.8} /> Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function AffiliateHub({ data }: { data: AffiliateHubData }) {
  if (!data.enrolled) {
    return (
      <div className="max-w-lg">
        <div className="bg-white border border-surface-200 rounded-xl shadow-card p-6 text-center">
          <Network className="w-8 h-8 text-brand-600 mx-auto mb-3" strokeWidth={1.6} />
          <h2 className="text-base font-semibold text-surface-900">Join the affiliate programme</h2>
          <p className="text-sm text-surface-500 mt-1.5">
            Earn recurring commission on every workspace you refer — and an override on the affiliates
            you recruit. Activate your account to get your referral and recruit links.
          </p>
          <a
            href="/affiliate"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" strokeWidth={2} /> Activate affiliate account
          </a>
        </div>
      </div>
    );
  }

  const lifetime = data.directEarnedCents + data.overrideEarnedCents;

  return (
    <div className="max-w-2xl space-y-8">
      <CopyField label="Your referral link (refer customers)" value={data.referralLink} />
      <CopyField
        label={`Your recruit link (recruit sub-affiliates · they earn, you get ${data.overrideRatePct}% override)`}
        value={data.recruitLink}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: MousePointerClick, label: "Clicks", value: String(data.clicks) },
          { icon: Users, label: "Conversions", value: String(data.conversions) },
          { icon: PoundSterling, label: "Direct earned", value: gbp(data.directEarnedCents) },
          { icon: Layers, label: "Override earned", value: gbp(data.overrideEarnedCents) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-white border border-surface-200 rounded-xl shadow-card p-4 text-center">
            <Icon className="w-5 h-5 text-brand-600 mx-auto mb-2" strokeWidth={1.8} />
            <p className="text-xl font-bold text-surface-900">{value}</p>
            <p className="text-xs text-surface-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-center justify-between">
        <p className="text-sm text-brand-800 font-medium">Lifetime earnings (direct + override)</p>
        <p className="text-lg font-bold text-brand-700">{gbp(lifetime)}</p>
      </div>

      {/* Sub-affiliates (tier 2) */}
      <div className="border-t border-surface-100 pt-6">
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-4 h-4 text-surface-500" strokeWidth={1.8} />
          <h2 className="text-sm font-semibold text-surface-900">Your sub-affiliates</h2>
          <span className="text-xs text-surface-400">({data.subAffiliates.length})</span>
        </div>
        {data.subAffiliates.length === 0 ? (
          <p className="text-sm text-surface-500">
            No sub-affiliates yet. Share your recruit link to start building your network — you earn a{" "}
            {data.overrideRatePct}% override on everything they refer.
          </p>
        ) : (
          <div className="bg-white border border-surface-200 rounded-xl shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Affiliate</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Override</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">You earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {data.subAffiliates.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-surface-900">{s.name}</td>
                    <td className="px-4 py-3 text-surface-600">{s.overrideRatePct}%</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-surface-900">{gbp(s.earnedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
