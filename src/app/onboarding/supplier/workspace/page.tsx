"use client";

import { OnboardingWorkspaceStep } from "@/components/onboarding/WorkspaceStep";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Business Profile" },
  { id: 4, label: "Complete" },
];

export default function SupplierOnboardingWorkspacePage() {
  return (
    <OnboardingWorkspaceStep
      portalType="supplier"
      workspaceType="supplier"
      steps={STEPS}
      backRoute="/onboarding/supplier/account"
      nextRoute="/onboarding/supplier/profile"
      title="Create your supplier workspace"
      subtitle="This is where you manage jobs, quotes and compliance documents."
    />
  );
}
