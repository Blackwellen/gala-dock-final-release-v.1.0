import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnboardingRoute } from "@/components/onboarding-route";

export const metadata: Metadata = { title: "Set up · Gala Dock", robots: { index: false } };

export default async function Page({ params, searchParams }: PageProps<"/onboarding/[flow]">) {
  const { flow } = await params;
  if (flow !== "customer" && flow !== "organizer" && flow !== "provider") notFound();
  return <OnboardingRoute flow={flow} searchParams={searchParams} />;
}
