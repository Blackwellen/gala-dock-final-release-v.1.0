"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  Building2,
  Briefcase,
  DollarSign,
  Users,
  ChevronRight,
  ChevronLeft,
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

const ROLES = [
  {
    id: "event-planner",
    icon: CalendarCheck,
    title: "Event Planner",
    description: "I plan, coordinate and deliver events end-to-end.",
  },
  {
    id: "agency-owner",
    icon: Briefcase,
    title: "Agency Owner",
    description: "I run an events agency and manage a team.",
  },
  {
    id: "venue-manager",
    icon: Building2,
    title: "Venue Manager",
    description: "I manage a venue and host events for clients.",
  },
  {
    id: "finance-manager",
    icon: DollarSign,
    title: "Finance Manager",
    description: "I oversee budgets, invoices and financial reporting.",
  },
  {
    id: "team-member",
    icon: Users,
    title: "Team Member",
    description: "I support the team across events and tasks.",
  },
];

export default function OnboardingRolePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleNext() {
    if (!selected) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    router.push("/onboarding/plan");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={3} />
        </div>

        {/* Header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            What best describes your role?
          </h1>
          <p className="mt-1.5 text-sm text-surface-500">
            We&apos;ll tailor your experience to match how you work.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map((role) => {
            const Icon = role.icon;
            const isSelected = selected === role.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelected(role.id)}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all",
                  isSelected
                    ? "border-brand-600 bg-brand-50 shadow-brand/10 shadow-sm"
                    : "border-surface-200 hover:border-surface-300 hover:bg-surface-50"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    isSelected
                      ? "bg-brand-600 text-white"
                      : "bg-surface-100 text-surface-500"
                  )}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} />
                </div>
                <div>
                  <p
                    className={cn(
                      "text-sm font-semibold transition-colors",
                      isSelected ? "text-brand-700" : "text-surface-800"
                    )}
                  >
                    {role.title}
                  </p>
                  <p className="mt-0.5 text-xs text-surface-500 leading-snug">
                    {role.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-2">
          <button
            type="button"
            onClick={() => router.push("/onboarding/workspace")}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-all"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!selected || loading}
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
