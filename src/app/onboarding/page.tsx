import type { Metadata } from "next";
import { OnboardingRoute } from "@/components/onboarding-route";

export const metadata: Metadata = { title: "Choose your experience · Gala Dock", robots: { index: false } };

export default function Page({ searchParams }: PageProps<"/onboarding">) {
  return <OnboardingRoute flow="experience" searchParams={searchParams} />;
}
