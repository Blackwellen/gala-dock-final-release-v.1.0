"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { createClient } from "@/lib/supabase/client";
import { getOrStartOnboardingSession, completeOnboarding, type PortalType } from "@/lib/onboarding/actions";
import type { OnboardingWizardStep } from "./AccountStep";

/** Shared final step for the operator onboarding flows (Venue Manager, Supplier).
 * Idempotent (completeOnboarding no-ops on retry) and resolves the real
 * workspace name for the summary instead of a placeholder. */
export function OnboardingCompleteStep({
  portalType,
  steps,
  destination = "/event-manager/home",
  heading = "You're all set!",
  description = "Your Gala Dock workspace is ready.",
}: {
  portalType: PortalType;
  steps: OnboardingWizardStep[];
  destination?: string;
  heading?: string;
  description?: string;
}) {
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Your workspace");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const result = await getOrStartOnboardingSession(portalType, "complete");
      if (!result.ok) return;
      setSessionId(result.data.id);

      if (result.data.workspace_draft_id) {
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", result.data.workspace_draft_id)
          .maybeSingle();
        if (workspace?.name) setWorkspaceName(workspace.name);
      }

      await completeOnboarding(result.data.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function goToDashboard() {
    setFinishing(true);
    if (sessionId) await completeOnboarding(sessionId);
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={steps} current={steps.length} />
        </div>

        <div className="flex flex-col items-center text-center py-4">
          <CheckCircle2 className="w-20 h-20 text-success-500 mb-5" strokeWidth={1.4} />
          <h1 className="text-3xl font-bold text-surface-900 tracking-tight">{heading}</h1>
          <p className="mt-3 text-base text-surface-500 max-w-md leading-relaxed">{description}</p>
        </div>

        <div className="mt-7 rounded-xl border border-surface-200 bg-surface-50 px-4 py-4 text-center">
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Workspace</p>
          <p className="mt-1 text-sm font-bold text-surface-900 truncate">{workspaceName}</p>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={goToDashboard}
            disabled={finishing}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
          >
            {finishing ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Go to dashboard
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
