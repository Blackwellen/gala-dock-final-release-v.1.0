"use client";

import { OnboardingWorkspaceStep } from "@/components/onboarding/WorkspaceStep";

const STEPS = [
  { id: 1, label: "Account" },
  { id: 2, label: "Workspace" },
  { id: 3, label: "Venue Profile" },
  { id: 4, label: "Complete" },
];

export default function VenueManagerOnboardingWorkspacePage() {
  return (
    <OnboardingWorkspaceStep
      portalType="venue_manager"
      workspaceType="venue"
      steps={STEPS}
      backRoute="/onboarding/venue-manager/account"
      nextRoute="/onboarding/venue-manager/profile"
      title="Create your venue operations workspace"
      subtitle="This is where your team manages venues, bookings and hire."
    />
  );
}
