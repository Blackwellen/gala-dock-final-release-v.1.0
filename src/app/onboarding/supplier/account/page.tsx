"use client";

import { OnboardingAccountStep } from "@/components/onboarding/AccountStep";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Business Profile" },
  { id: 4, label: "Complete" },
];

export default function SupplierOnboardingAccountPage() {
  return (
    <OnboardingAccountStep
      portalType="supplier"
      steps={STEPS}
      nextRoute="/onboarding/supplier/workspace"
      title="Set up your profile"
      subtitle="Tell us a bit about yourself so we can personalise your supplier workspace."
    />
  );
}
