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
  return (
    <nav className="flex gap-1">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
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
];

export const SUPPLIERS_TABS: SectionTab[] = [
  { href: `${EM}/suppliers`, label: "Suppliers" },
  { href: `${EM}/rfqs`, label: "RFQs" },
];
