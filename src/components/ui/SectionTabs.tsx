"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
}

// Sub-tab bar for a section (e.g. Sales → Leads/Proposals; Suppliers → Directory/RFQs).
// Sub-tabs are real sub-sections — NOT view types. View types (table/board/calendar) belong in a
// view switcher inside the page, not here. Designed to sit in PageHeader's `tabs` slot.
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  // When one tab's href is a prefix of another's (e.g. Overview="/listings" and
  // Reviews="/listings/reviews"), only the longest matching href should be active —
  // otherwise Overview would also light up while viewing Reviews/Payouts.
  const matching = tabs.filter((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  const bestMatch = matching.reduce<SectionTab | null>(
    (best, t) => (!best || t.href.length > best.href.length ? t : best),
    null
  );
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.href === bestMatch?.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-surface-500 hover:text-surface-700"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const EM = "/event-manager";

/** Section sub-tab configs (Overview-first / real sub-sections, never view types). */
export const SALES_TABS: SectionTab[] = [
  { href: `${EM}/leads`, label: "Leads" },
  { href: `${EM}/proposals`, label: "Proposals" },
  { href: `${EM}/forms`, label: "Forms" },
];

export const SUPPLIERS_TABS: SectionTab[] = [
  { href: `${EM}/suppliers`, label: "Suppliers" },
  { href: `${EM}/rfqs`, label: "RFQs" },
];

/** My Listings (seller console) — venue + supplier personas. Overview is the listings grid itself. */
export const LISTINGS_TABS: SectionTab[] = [
  { href: `${EM}/marketplace/listings`, label: "Overview" },
  { href: `${EM}/marketplace/listings/enquiries`, label: "Enquiries" },
  { href: `${EM}/marketplace/listings/reviews`, label: "Reviews" },
  { href: `${EM}/marketplace/listings/payouts`, label: "Payouts" },
  { href: `${EM}/marketplace/listings/verification`, label: "Verification" },
];

/** Jobs (supplier persona's work queue). Overview is the full-workspace job list itself. */
export const JOBS_TABS: SectionTab[] = [
  { href: `${EM}/jobs`, label: "Overview" },
  { href: `${EM}/jobs/assigned`, label: "Assigned" },
  { href: `${EM}/jobs/completed`, label: "Completed" },
  { href: `${EM}/jobs/evidence`, label: "Evidence" },
];

export const AUTOMATIONS_TABS: SectionTab[] = [
  { href: `${EM}/automations`, label: "Overview" },
  { href: `${EM}/automations/recipes`, label: "Recipes" },
  { href: `${EM}/automations/my-automations`, label: "My Automations" },
  { href: `${EM}/automations/builder/new`, label: "Canvas Builder" },
  { href: `${EM}/automations/runs`, label: "Runs & Logs" },
  { href: `${EM}/automations/usage`, label: "Usage & Limits" },
  { href: `${EM}/automations/ai-builder`, label: "AI Builder" },
  { href: `${EM}/automations/integrations`, label: "Integrations" },
  { href: `${EM}/automations/approvals`, label: "Approvals" },
  { href: `${EM}/automations/errors`, label: "Errors" },
];

export const TEAM_TABS: SectionTab[] = [
  { href: `${EM}/team/workload`, label: "Workload" },
  { href: `${EM}/team/availability`, label: "Availability" },
  { href: `${EM}/team/members`, label: "Team Members" },
  { href: `${EM}/team/find`, label: "Find Team" },
  { href: `${EM}/team/staffing-requests`, label: "Staffing Requests" },
  { href: `${EM}/team/insights`, label: "Insights" },
];

export const FINANCE_TABS: SectionTab[] = [
  { href: `${EM}/finance`, label: "Overview" },
  { href: `${EM}/finance/quotes`, label: "Quotes" },
  { href: `${EM}/finance/invoices`, label: "Invoices" },
  { href: `${EM}/finance/payments`, label: "Payments" },
  { href: `${EM}/finance/profit`, label: "Profit" },
  { href: `${EM}/finance/ticket-sales`, label: "Ticket Sales" },
  { href: `${EM}/finance/deposits`, label: "Deposits" },
  { href: `${EM}/finance/supplier-payments`, label: "Supplier Payments" },
  { href: `${EM}/finance/wages-hours`, label: "Wages & Hours" },
  { href: `${EM}/finance/cashflow`, label: "Cashflow" },
];
