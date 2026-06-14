"use client";

import { useState } from "react";
import { Link2, Copy, Check, Lock } from "lucide-react";

interface Props {
  /** The stored Stripe payment link, or null when not generated. */
  paymentLinkUrl: string | null;
  /**
   * Whether Stripe is configured for this workspace (env/config gated).
   * When false, the generate action is disabled with a clear reason.
   */
  stripeConfigured: boolean;
}

/**
 * Online payment link card (Stripe stub).
 *
 * Stripe is an OPTIONAL add-on. This component does NOT call the Stripe API or
 * import the stripe dependency — it only surfaces an existing
 * `invoices.stripe_payment_link_url` for copying, or a disabled
 * "Connect Stripe to enable" state when no link / config is present.
 */
export function PaymentLinkCard({ paymentLinkUrl, stripeConfigured }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!paymentLinkUrl) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(paymentLinkUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-4 h-4 text-surface-500" />
        <h3 className="text-sm font-semibold text-surface-900">Online Payment Link</h3>
      </div>

      {paymentLinkUrl ? (
        <>
          <p className="text-sm text-surface-600 mb-3">
            Share this link with your client. Payments go directly to your Stripe account.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={paymentLinkUrl}
              className="flex-1 min-w-0 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-700 tabular-nums focus:outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy Link"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-surface-600 mb-4">
            Generate a Stripe payment link so your client can pay online by card.
          </p>
          <button
            type="button"
            disabled
            title="Connect Stripe in Settings → Finance to enable online payments"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-surface-400 text-sm font-medium cursor-not-allowed"
          >
            <Lock className="w-4 h-4" />
            Generate Payment Link
          </button>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
            <Lock className="w-3.5 h-3.5 text-warning-600 mt-0.5 shrink-0" />
            <p className="text-xs text-warning-700">
              {stripeConfigured
                ? "Stripe is connected, but no payment link has been generated for this invoice yet. Online payment links activate in a future update."
                : "Stripe is an optional add-on. Connect Stripe in Settings → Finance to enable online card payments. No Stripe account is required to use the rest of Gala Dock."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
