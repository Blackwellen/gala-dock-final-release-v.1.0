"use client";

import { OnboardingAccountStep } from "@/components/onboarding/AccountStep";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Venue Profile" },
  { id: 4, label: "Complete" },
];

export default function VenueManagerOnboardingAccountPage() {
  return (
    <OnboardingAccountStep
      portalType="venue_manager"
      steps={STEPS}
      nextRoute="/onboarding/venue-manager/workspace"
      title="Set up your profile"
      subtitle="Tell us a bit about yourself so we can personalise your venue operations."
    />
  );
}
