"use client";

import { OnboardingCompleteStep } from "@/components/onboarding/CompleteStep";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Business Profile" },
  { id: 4, label: "Complete" },
];

export default function SupplierOnboardingCompletePage() {
  return (
    <OnboardingCompleteStep
      portalType="supplier"
      steps={STEPS}
      description="Your supplier workspace is ready. Add pricing, compliance documents and your team from Settings."
    />
  );
}
