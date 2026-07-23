import { MarketingNav } from "@/components/layout/MarketingNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { isFlagEnabled } from "@/lib/flags/resolve";
import { globalReleaseStage } from "@/lib/flags/context";

// Server-resolved once per request so the correct nav (ticketing ON vs the default "Event
// Delivery OS" nav) renders on first paint — no client-side flash of the wrong state. Same
// flag + input shape as src/app/(marketing)/discover/page.tsx, which gates the directory
// this nav's "Events" link points to.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const ticketingEnabled = isFlagEnabled("publicEventsDirectory", {
    workspaceType: "organizer",
    releaseStage: globalReleaseStage(),
    plan: "enterprise",
  });

  return (
    <div className="min-h-full flex flex-col bg-white">
      <MarketingNav ticketingEnabled={ticketingEnabled} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
