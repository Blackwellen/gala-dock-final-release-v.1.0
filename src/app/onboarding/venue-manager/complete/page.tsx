"use client";

import { OnboardingCompleteStep } from "@/components/onboarding/CompleteStep";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Venue Profile" },
  { id: 4, label: "Complete" },
];

export default function VenueManagerOnboardingCompletePage() {
  return (
    <OnboardingCompleteStep
      portalType="venue_manager"
      steps={STEPS}
      description="Your venue operations workspace is ready. Add spaces, rate cards and your team from Settings."
    />
  );
}
