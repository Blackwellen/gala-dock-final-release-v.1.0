import { Inbox, ShieldCheck, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, LISTINGS_TABS } from "@/components/ui/SectionTabs";

type ConsoleArea = "enquiries" | "verification";

const CONTENT: Record<ConsoleArea, { title: string; description: string; icon: LucideIcon; cards: readonly string[] }> = {
  enquiries: {
    title: "Marketplace enquiries",
    description: "Review buyer requests, quote requests and booking conversations from your listings.",
    icon: Inbox,
    cards: ["New enquiries needing a response", "Quote and booking request status", "Saved response and follow-up workflow"],
  },
  verification: {
    title: "Listing verification",
    description: "Track the profile, document and marketplace checks required before listings can be promoted or published.",
    icon: ShieldCheck,
    cards: ["Business and profile verification", "Document and insurance requirements", "Marketplace review and publication status"],
  },
};

export function MarketplaceConsoleShell({ area }: { area: ConsoleArea }) {
  const content = CONTENT[area];
  const Icon = content.icon;
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={content.title} description={content.description} tabs={<SectionTabs tabs={LISTINGS_TABS} />} />
      <div className="p-6">
        <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-card">
          <Icon className="h-6 w-6 text-brand-700" />
          <h2 className="mt-3 font-semibold text-surface-900">Marketplace Console</h2>
          <p className="mt-1 text-sm text-surface-600">This is the dedicated seller-console location for {area}. It is intentionally separate from the organizer buyer marketplace.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">{content.cards.map((card) => <div key={card} className="rounded-lg bg-surface-50 p-4 text-sm font-medium text-surface-700">{card}<p className="mt-2 text-xs font-normal leading-5 text-surface-500">Operational records will appear here when the marketplace workflow is enabled.</p></div>)}</div>
        </div>
      </div>
    </div>
  );
}
