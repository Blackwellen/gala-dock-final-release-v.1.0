"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Zap, TrendingUp, Building2, ChevronRight, ChevronLeft } from "lucide-react";
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

const PLANS = [
  {
    id: "starter",
    icon: Zap,
    name: "Starter",
    price: "£49",
    period: "/mo",
    description: "Perfect for freelancers and small teams.",
    highlight: false,
    features: [
      "Up to 10 active events",
      "3 team members",
      "Supplier management",
      "Basic run sheets",
      "Email support",
    ],
  },
  {
    id: "growth",
    icon: TrendingUp,
    name: "Growth",
    price: "£149",
    period: "/mo",
    description: "For growing agencies and in-house teams.",
    highlight: true,
    badge: "Most popular",
    features: [
      "Unlimited active events",
      "15 team members",
      "Client & supplier portals",
      "Advanced finance tracking",
      "AI Copilot included",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    icon: Building2,
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organisations with complex needs.",
    highlight: false,
    features: [
      "Unlimited everything",
      "Unlimited team members",
      "Custom integrations",
      "Dedicated account manager",
      "SLA & uptime guarantee",
      "Custom contract & invoicing",
    ],
  },
];

export default function OnboardingPlanPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("growth");
  const [loading, setLoading] = useState(false);

  async function handleNext() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    router.push("/onboarding/demo-data");
  }

  return (
    <div className="w-full max-w-2xl animate-fade-in">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card p-8">
        {/* Stepper */}
        <div className="flex justify-center mb-8 overflow-x-auto pb-2">
          <WizardStepper steps={STEPS} current={4} />
        </div>

        {/* Header */}
        <div className="mb-2 text-center">
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Choose your plan
          </h1>
          <p className="mt-1.5 text-sm text-surface-500">
            All plans include a{" "}
            <span className="font-semibold text-brand-700">14-day free trial</span>. No credit
            card required.
          </p>
        </div>

        {/* Plan cards */}
        <div className="mt-6 grid grid-cols-1 gap-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isSelected = selected === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.id)}
                className={cn(
                  "relative flex items-start gap-4 p-5 rounded-xl border-2 text-left transition-all w-full",
                  isSelected
                    ? "border-brand-600 bg-brand-50"
                    : "border-surface-200 hover:border-surface-300 hover:bg-surface-50",
                  plan.highlight && !isSelected && "border-brand-200"
                )}
              >
                {/* Badge */}
                {plan.badge && (
                  <span className="absolute top-3 right-3 text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-600 text-white">
                    {plan.badge}
                  </span>
                )}

                {/* Selected indicator */}
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors",
                    isSelected
                      ? "border-brand-600 bg-brand-600"
                      : "border-surface-300"
                  )}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>

                {/* Plan info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        isSelected ? "text-brand-600" : "text-surface-500"
                      )}
                      strokeWidth={2}
                    />
                    <span className="text-sm font-bold text-surface-900">{plan.name}</span>
                    <span className="text-lg font-bold text-surface-900 ml-auto">
                      {plan.price}
                      <span className="text-sm font-normal text-surface-500">{plan.period}</span>
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 mb-3">{plan.description}</p>
                  <ul className="space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-surface-600">
                        <Check
                          className={cn(
                            "w-3.5 h-3.5 shrink-0",
                            isSelected ? "text-brand-600" : "text-success-500"
                          )}
                          strokeWidth={2.5}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-2">
          <button
            type="button"
            onClick={() => router.push("/onboarding/role")}
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
                Start free trial
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
