"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, AlertCircle, Clock } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { createClient } from "@/lib/supabase/client";
import { getOrStartOnboardingSession, completeOnboarding } from "@/lib/onboarding/actions";

const STEPS = [
  { id: 1, label: "Application" },
  { id: 2, label: "Complete" },
];

export default function AffiliateCompletePage() {
  const router = useRouter();
  const [finishing, setFinishing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const result = await getOrStartOnboardingSession("affiliate", "complete");
      if (!result.ok) {
        setError(result.error);
        setFinishing(false);
        return;
      }

      const apply = result.data.draft?.apply as
        | { fullName?: string; website?: string; audienceSize?: string; promotionPlan?: string; channels?: string[] }
        | undefined;

      // Standalone affiliate identity (user_id, not workspace_id) — status starts
      // 'draft' (functionally "submitted, under review") until Platform Admin
      // approves it to 'active'. Idempotent: an existing account is left as-is.
      const { data: existing } = await supabase
        .from("affiliate_accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await supabase.from("affiliate_accounts").insert({
          user_id: user.id,
          status: "draft",
          payout_method: "manual_bank",
          default_currency: "GBP",
          min_payout_currency: "GBP",
          notes_internal: JSON.stringify({
            website: apply?.website ?? null,
            audienceSize: apply?.audienceSize ?? null,
            promotionPlan: apply?.promotionPlan ?? null,
            channels: apply?.channels ?? [],
            appliedName: apply?.fullName ?? null,
          }),
        });
        if (insertError) {
          setError(insertError.message);
          setFinishing(false);
          return;
        }
      }

      await completeOnboarding(result.data.id);
      setFinishing(false);
    })();
  }, []);

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={2} />
        </div>

        <div className="flex flex-col items-center text-center py-4">
          {error ? (
            <>
              <AlertCircle className="w-16 h-16 text-danger-500 mb-5" strokeWidth={1.4} />
              <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Something went wrong</h1>
              <p className="mt-3 text-sm text-danger-600 max-w-md leading-relaxed">{error}</p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-20 h-20 text-success-500 mb-5" strokeWidth={1.4} />
              <h1 className="text-3xl font-bold text-surface-900 tracking-tight">Application submitted</h1>
              <p className="mt-3 text-base text-surface-500 max-w-md leading-relaxed">
                Thanks for applying. Your affiliate application is under review — we&apos;ll email
                you once it&apos;s approved and your referral links are live.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                Under review
              </div>
            </>
          )}
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              router.push("/affiliate/dashboard");
              router.refresh();
            }}
            disabled={finishing}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
          >
            {finishing ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                View my application status
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
