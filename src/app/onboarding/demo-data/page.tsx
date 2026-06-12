"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  CalendarDays,
  Users,
  ListChecks,
  FileText,
  ChevronRight,
  ChevronLeft,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { WizardStepper } from "@/components/ui/WizardStepper";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Your Role" },
  { id: 4, label: "Plan" },
  { id: 5, label: "Demo Data" },
  { id: 6, label: "First Event" },
  { id: 7, label: "Invite Team" },
  { id: 8, label: "Complete" },
];

const DEMO_ITEMS = [
  {
    icon: CalendarDays,
    label: "3 sample events",
    description: "Wedding, corporate gala and private dinner",
  },
  {
    icon: Users,
    label: "8 supplier profiles",
    description: "Caterers, AV, florists, photographers & more",
  },
  {
    icon: ListChecks,
    label: "Task templates",
    description: "Pre-built checklists for every event type",
  },
  {
    icon: FileText,
    label: "Run sheet templates",
    description: "Detailed minute-by-minute schedules",
  },
];

export default function OnboardingDemoDataPage() {
  const router = useRouter();
  const [loadDemo, setLoadDemo] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleNext() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    router.push("/onboarding/first-event");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={5} />
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Explore with demo data
          </h1>
          <p className="mt-1.5 text-sm text-surface-500">
            We can populate your workspace with sample content so you can explore the platform
            immediately.
          </p>
        </div>

        {/* Toggle card */}
        <div
          className={cn(
            "rounded-xl border-2 p-5 transition-all",
            loadDemo ? "border-brand-600 bg-brand-50" : "border-surface-200 bg-surface-50"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  loadDemo ? "bg-brand-600 text-white" : "bg-surface-200 text-surface-500"
                )}
              >
                <Database className="w-5 h-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-900">Load demo data</p>
                <p className="mt-0.5 text-xs text-surface-500 leading-relaxed">
                  We&apos;ll create sample events, suppliers and tasks so you can explore the
                  platform without starting from scratch.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLoadDemo((v) => !v)}
              className="shrink-0 mt-0.5"
              aria-pressed={loadDemo}
            >
              {loadDemo ? (
                <ToggleRight className="w-9 h-9 text-brand-600" strokeWidth={1.5} />
              ) : (
                <ToggleLeft className="w-9 h-9 text-surface-400" strokeWidth={1.5} />
              )}
            </button>
          </div>

          {/* What will be created */}
          {loadDemo && (
            <div className="mt-5 pt-4 border-t border-brand-200">
              <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide mb-3">
                What we&apos;ll create
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DEMO_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-start gap-2.5 p-3 bg-white rounded-lg border border-brand-100"
                    >
                      <div className="w-7 h-7 rounded-md bg-brand-100 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-brand-600" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-surface-800">{item.label}</p>
                        <p className="text-xs text-surface-500 leading-snug mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-surface-400">
          You can delete demo data at any time from your workspace settings.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-2">
          <button
            type="button"
            onClick={() => router.push("/onboarding/plan")}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={loading}
            className="inline-flex items-center gap-2 py-2.5 px-6 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-brand"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
