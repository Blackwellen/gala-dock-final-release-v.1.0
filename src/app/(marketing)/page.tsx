import type { Metadata } from "next";
import { isFlagEnabled } from "@/lib/flags/resolve";
import { globalReleaseStage } from "@/lib/flags/context";
import { EnabledHome } from "./_home/EnabledHome";
import { DisabledHome } from "./_home/DisabledHome";

export const dynamic = "force-dynamic";

// Same flag input shape as the layout nav and /discover — resolved independently here since
// generateMetadata and the page component don't share request state across files.
function ticketingEnabled(): boolean {
  return isFlagEnabled("publicEventsDirectory", {
    workspaceType: "organizer",
    releaseStage: globalReleaseStage(),
    plan: "enterprise",
  });
}

export function generateMetadata(): Metadata {
  if (ticketingEnabled()) {
    return {
      title: "Gala Dock — Discover Events & Sell Tickets",
      description:
        "The all-in-one event operating system for organisers, and the best place for fans to discover and book amazing experiences.",
    };
  }
  return {
    title: "Gala Dock — Event Delivery OS for Agencies & Planners",
    description:
      "The all-in-one platform for event planners, agencies, and venues. Manage events, suppliers, tasks, finance and client communication in one place.",
  };
}

export default function HomePage() {
  return ticketingEnabled() ? <EnabledHome /> : <DisabledHome />;
}
