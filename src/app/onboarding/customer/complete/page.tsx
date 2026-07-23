"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, AlertCircle } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { createClient } from "@/lib/supabase/client";
import { getOrStartOnboardingSession, completeOnboarding } from "@/lib/onboarding/actions";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Preferences" },
  { id: 3, label: "Complete" },
];

export default function CustomerOnboardingCompletePage() {
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

      const result = await getOrStartOnboardingSession("customer", "complete");
      if (!result.ok) {
        setError(result.error);
        setFinishing(false);
        return;
      }

      const account = result.data.draft?.account as
        | {
            fullName?: string;
            phone?: string;
            preferredContactMethod?: string;
            timezone?: string;
            customerType?: string;
            companyName?: string;
            jobTitle?: string;
          }
        | undefined;
      const preferences = result.data.draft?.preferences as
        | {
            eventTypes?: string[];
            notifications?: Record<string, boolean>;
            marketingConsent?: boolean;
            smsConsent?: boolean;
          }
        | undefined;

      // Real record: create-or-update the customer's own row (RLS-scoped to self).
      const { error: upsertError } = await supabase.from("customers").upsert(
        {
          user_id: user.id,
          email: user.email ?? null,
          full_name: account?.fullName ?? null,
          phone: account?.phone ?? null,
          customer_type: account?.customerType ?? "individual",
          company_name: account?.companyName ?? null,
          job_title: account?.jobTitle ?? null,
          preferred_contact_method: account?.preferredContactMethod ?? "email",
          timezone: account?.timezone ?? "Europe/London",
          event_preferences: { eventTypes: preferences?.eventTypes ?? [] },
          notification_preferences: preferences?.notifications ?? {
            proposals: true,
            documents: true,
            invoices: true,
            event_updates: true,
          },
          marketing_consent: preferences?.marketingConsent ?? false,
          sms_consent: preferences?.smsConsent ?? false,
          onboarding_completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (upsertError) {
        setError(upsertError.message);
        setFinishing(false);
        return;
      }

      await completeOnboarding(result.data.id);
      setFinishing(false);
    })();
  }, []);

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={3} />
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
              <h1 className="text-3xl font-bold text-surface-900 tracking-tight">You&apos;re all set!</h1>
              <p className="mt-3 text-base text-surface-500 max-w-md leading-relaxed">
                Your Gala Dock account is ready. You&apos;ll find your tickets, proposals and
                invoices in one place.
              </p>
            </>
          )}
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              router.push("/account");
              router.refresh();
            }}
            disabled={finishing}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
          >
            {finishing ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Go to my account
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
