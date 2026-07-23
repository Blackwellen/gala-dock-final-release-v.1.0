"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Megaphone, X } from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { createLeadDraft, autosaveLeadStep, completeLeadWizard } from "../actions";
import {
  INITIAL_WIZARD_STATE,
  WIZARD_STEPS,
  isWizardStep,
  buildContactFormData,
  buildEventDetailsFormData,
  buildQualificationFormData,
  appendScoringContext,
  isControlFlowError,
  type WizardState,
  type WizardStep,
  type MemberOption,
} from "./wizard-types";
import { ContactSourceStep } from "./steps/ContactSourceStep";
import { EventDetailsStep } from "./steps/EventDetailsStep";
import { QualificationStep } from "./steps/QualificationStep";

export type { MemberOption };

const STEP_META: { id: number; key: WizardStep; label: string; description: string }[] = [
  { id: 1, key: "contact", label: "Contact & Source", description: "Who's enquiring" },
  { id: 2, key: "event-details", label: "Event Details", description: "What they're planning" },
  { id: 3, key: "qualification", label: "Qualification & Review", description: "Score & confirm" },
];

function buildFormDataForStep(step: WizardStep, state: WizardState): FormData {
  if (step === "contact") return buildContactFormData(state);
  if (step === "event-details") return buildEventDetailsFormData(state);
  return buildQualificationFormData(state);
}

export function NewLeadWizard({ teamMembers }: { teamMembers: MemberOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const step: WizardStep = isWizardStep(stepParam) ? stepParam : "contact";

  const [state, setState] = useState<WizardState>(INITIAL_WIZARD_STATE);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const leadIdRef = useRef<string | null>(null);
  const stateRef = useRef<WizardState>(state);
  const stepRef = useRef<WizardStep>(step);
  useEffect(() => {
    stateRef.current = state;
    stepRef.current = step;
  }, [state, step]);

  const update = useCallback((patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  /** Ensures a draft lead exists (creating it on first save) and persists the current step's fields. */
  const persistStep = useCallback(async (targetStep: WizardStep): Promise<string> => {
    setSaveStatus("saving");
    try {
      let id = leadIdRef.current;
      if (!id) {
        const fd = buildContactFormData(stateRef.current);
        const result = await createLeadDraft(fd);
        id = result.id;
        leadIdRef.current = id;
        setLeadId(id);
        if (targetStep !== "contact") {
          await autosaveLeadStep(id, targetStep, buildFormDataForStep(targetStep, stateRef.current));
        }
      } else {
        await autosaveLeadStep(id, targetStep, buildFormDataForStep(targetStep, stateRef.current));
      }
      setSaveStatus("saved");
      return id;
    } catch (err) {
      setSaveStatus("idle");
      throw err;
    }
  }, []);

  // Lightweight debounced autosave once a draft exists, so in-progress edits aren't lost.
  useEffect(() => {
    if (!leadId) return;
    const handle = setTimeout(() => {
      autosaveLeadStep(leadId, stepRef.current, buildFormDataForStep(stepRef.current, stateRef.current))
        .then(() => setSaveStatus("saved"))
        .catch(() => {
          /* silent — explicit Save Draft / Continue clicks surface errors */
        });
    }, 1500);
    return () => clearTimeout(handle);
  }, [state, leadId]);

  function goToStep(next: WizardStep) {
    router.push(`/event-manager/leads/new?step=${next}`);
  }

  async function handleSaveDraft() {
    setError(null);
    setPending(true);
    try {
      await persistStep(step);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setPending(false);
    }
  }

  async function handleContinue(next: WizardStep) {
    setError(null);
    setPending(true);
    try {
      await persistStep(step);
      goToStep(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save and continue");
    } finally {
      setPending(false);
    }
  }

  function handleBack(prev: WizardStep) {
    goToStep(prev);
  }

  async function handleComplete(openAfter: boolean) {
    setError(null);
    setPending(true);
    try {
      const id = await persistStep("qualification");
      const fd = buildQualificationFormData(state);
      appendScoringContext(fd, state);
      await completeLeadWizard(id, fd, openAfter);
    } catch (err) {
      if (isControlFlowError(err)) throw err;
      setError(err instanceof Error ? err.message : "Failed to create lead");
      setPending(false);
    }
  }

  const currentMeta = STEP_META.find((s) => s.key === step) ?? STEP_META[0];
  const stepperSteps = STEP_META.map((s) => ({ id: s.id, label: s.label, description: s.description }));

  return (
    <div className="animate-fade-in min-h-screen flex flex-col bg-surface-50">
      {/* Header */}
      <div className="bg-white border-b border-surface-200 px-6 py-4 shrink-0">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {step === "contact" ? (
              <Link
                href="/event-manager/leads"
                className="flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-surface-900 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                Back to Sales
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const idx = STEP_META.findIndex((s) => s.key === step);
                  handleBack(STEP_META[Math.max(0, idx - 1)].key);
                }}
                aria-label="Back"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-900 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
            <div className="h-5 w-px bg-surface-200 shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <Megaphone className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-surface-900 truncate">New Lead</h1>
                {step === "contact" ? (
                  <p className="text-xs text-surface-500 truncate">
                    Create a new lead and capture enquiry details to get started.
                  </p>
                ) : (
                  <p className="text-xs text-surface-500 truncate">
                    Step {currentMeta.id} of 3: {currentMeta.label}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {leadId && (
              <span
                className={
                  "hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
                  (saveStatus === "saving"
                    ? "border-surface-200 bg-surface-50 text-surface-500"
                    : "border-success-200 bg-success-50 text-success-700")
                }
              >
                <span className={"w-1.5 h-1.5 rounded-full " + (saveStatus === "saving" ? "bg-surface-400 animate-pulse" : "bg-success-500")} />
                {saveStatus === "saving" ? "Saving…" : "Autosaved · Just now"}
              </span>
            )}
            {step !== "contact" && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={pending}
                className="px-3 py-1.5 text-xs font-semibold text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors disabled:opacity-60"
              >
                Save Draft
              </button>
            )}
            <Link
              href="/event-manager/leads"
              className="w-8 h-8 hidden sm:flex items-center justify-center rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-900 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto w-full mt-4 overflow-x-auto">
          <WizardStepper steps={stepperSteps} current={currentMeta.id} />
        </div>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto w-full px-6 pt-4">
          <div className="p-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg">
            {error}
          </div>
        </div>
      )}

      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        {step === "contact" && (
          <ContactSourceStep
            state={state}
            update={update}
            teamMembers={teamMembers}
            pending={pending}
            onSaveDraft={handleSaveDraft}
            onContinue={() => handleContinue("event-details")}
          />
        )}
        {step === "event-details" && (
          <EventDetailsStep
            state={state}
            update={update}
            pending={pending}
            onSaveDraft={handleSaveDraft}
            onBack={() => handleBack("contact")}
            onContinue={() => handleContinue("qualification")}
          />
        )}
        {step === "qualification" && (
          <QualificationStep
            state={state}
            update={update}
            teamMembers={teamMembers}
            pending={pending}
            onSaveDraft={handleSaveDraft}
            onBack={() => handleBack("event-details")}
            onEditStep={(target) => goToStep(target)}
            onCreate={handleComplete}
          />
        )}
      </div>
    </div>
  );
}

export const _WIZARD_STEPS_FOR_TESTS = WIZARD_STEPS;
