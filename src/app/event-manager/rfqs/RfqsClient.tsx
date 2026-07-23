"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, SUPPLIERS_TABS } from "@/components/ui/SectionTabs";
import type { RfqRecord, SupplierRecord } from "../suppliers/_data/types";
import { RfqsView } from "./RfqsView";

export function RfqsClient({ rfqs, suppliers }: { rfqs: RfqRecord[]; suppliers: SupplierRecord[] }) {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="RFQs"
        description="Request quotes from multiple suppliers and compare responses side by side"
        tabs={<SectionTabs tabs={SUPPLIERS_TABS} />}
        actions={
          <>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <span className="hidden sm:inline">Send RFQ Invite</span>
              <span className="sm:hidden">Invite</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <span className="hidden sm:inline">Filter</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <span className="hidden sm:inline">Import</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <span className="hidden sm:inline">Export</span>
            </button>
            <Link
              href="/event-manager/rfqs/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              New RFQ
            </Link>
          </>
        }
      />
      <RfqsView rfqs={rfqs} suppliers={suppliers} />
    </div>
  );
}
