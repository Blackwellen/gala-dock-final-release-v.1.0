"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, Plus, Send, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, SUPPLIERS_TABS } from "@/components/ui/SectionTabs";
import { TabNav } from "@/components/ui/TabNav";
import type { SupplierRecord } from "./_data/types";
import { hasMissingDocs } from "./_data/kpis";
import { AllSuppliersView } from "./_views/AllSuppliersView";
import { ActiveSuppliersView } from "./_views/ActiveSuppliersView";
import { PausedSuppliersView } from "./_views/PausedSuppliersView";
import { MissingDocumentsView } from "./_views/MissingDocumentsView";
import { RecentlyUsedView } from "./_views/RecentlyUsedView";
import { ArchivedSuppliersView } from "./_views/ArchivedSuppliersView";

type ViewId = "all" | "active" | "paused" | "missing-documents" | "recently-used" | "archived";
const VALID_VIEWS: ViewId[] = ["all", "active", "paused", "missing-documents", "recently-used", "archived"];

export function SuppliersClient({ suppliers }: { suppliers: SupplierRecord[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const activeView: ViewId = VALID_VIEWS.includes(rawView as ViewId) ? (rawView as ViewId) : "all";

  const setActiveView = (id: string) => {
    router.replace(`/event-manager/suppliers?view=${id}`, { scroll: false });
  };

  const tabs = useMemo(
    () => [
      { id: "all", label: "All Suppliers", count: suppliers.length },
      { id: "active", label: "Active", count: suppliers.filter((s) => s.status === "active").length },
      { id: "paused", label: "Paused", count: suppliers.filter((s) => s.status === "paused").length, badge: "warning" as const },
      { id: "missing-documents", label: "Missing Documents", count: suppliers.filter(hasMissingDocs).length, badge: "danger" as const },
      { id: "recently-used", label: "Recently Used", count: suppliers.filter((s) => s.recentlyUsedAt !== null).length },
      { id: "archived", label: "Archived", count: suppliers.filter((s) => s.status === "archived").length },
    ],
    [suppliers]
  );

  const descriptionByView: Record<ViewId, string> = {
    all: "Manage your supplier register, documents and onboarding",
    active: "Suppliers currently available for bookings and RFQs",
    paused: "Suppliers temporarily on hold — review and reactivate when ready",
    "missing-documents": "Suppliers with outstanding compliance documents that need chasing",
    "recently-used": "Suppliers booked in the last 90 days and their performance",
    archived: "Suppliers removed from the active register, kept for compliance retention",
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Suppliers"
        description={descriptionByView[activeView]}
        actions={
          <>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Send className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Send Onboarding Invite</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Filter className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Filter</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Upload className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Export</span>
            </button>
            <Link
              href="/event-manager/suppliers/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Add Supplier
            </Link>
          </>
        }
        tabs={
          <div className="flex flex-col gap-1">
            <SectionTabs tabs={SUPPLIERS_TABS} />
            <TabNav tabs={tabs} active={activeView} onChange={setActiveView} />
          </div>
        }
      />

      <div className="p-6 max-w-[1600px]">
        {activeView === "all" && <AllSuppliersView suppliers={suppliers} />}
        {activeView === "active" && <ActiveSuppliersView suppliers={suppliers} />}
        {activeView === "paused" && <PausedSuppliersView suppliers={suppliers} />}
        {activeView === "missing-documents" && <MissingDocumentsView suppliers={suppliers} />}
        {activeView === "recently-used" && <RecentlyUsedView suppliers={suppliers} />}
        {activeView === "archived" && <ArchivedSuppliersView suppliers={suppliers} />}
      </div>
    </div>
  );
}
