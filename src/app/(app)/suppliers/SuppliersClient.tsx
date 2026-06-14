"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Upload, Download, Filter, MoreHorizontal,
  Users2, Star, FileText, AlertTriangle, Shield, TrendingUp,
  Send, Search,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/EmptyState";

export interface SupplierRow {
  id: string;
  name: string;
  category: string;
  location: string;
  status: string;
  docsStatus: "verified" | "pending" | "missing";
  lastUsed: string;
  contact: string;
}

export interface SuppliersKpis {
  total: number;
  preferred: number;
  pending: number;
  missingDocs: number;
  insuranceExpiring: number;
  avgResponse: string;
}

// Map the live supplier_status enum onto the StatusBadge vocabulary.
function badgeStatus(status: string): string {
  if (status === "suspended_by_admin") return "suspended";
  if (status === "paused") return "inactive";
  return status; // "active" | "archived"
}

const TAB_FILTER: Record<string, (s: SupplierRow) => boolean> = {
  all: () => true,
  active: (s) => s.status === "active",
  paused: (s) => s.status === "paused",
  missing: (s) => s.docsStatus === "missing",
  recent: (s) => s.lastUsed !== "—" && s.status !== "archived",
  archived: (s) => s.status === "archived",
};

export function SuppliersClient({
  suppliers,
  kpis,
}: {
  suppliers: SupplierRow[];
  kpis: SuppliersKpis;
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [query, setQuery] = useState("");

  const tabs = useMemo(
    () => [
      { id: "all", label: "All Suppliers", count: suppliers.length },
      { id: "active", label: "Active", count: suppliers.filter((s) => s.status === "active").length },
      { id: "paused", label: "Paused", count: suppliers.filter((s) => s.status === "paused").length, badge: "warning" as const },
      { id: "missing", label: "Missing Documents", count: suppliers.filter((s) => s.docsStatus === "missing").length, badge: "danger" as const },
      { id: "recent", label: "Recently Used" },
      { id: "archived", label: "Archived", count: suppliers.filter((s) => s.status === "archived").length },
    ],
    [suppliers]
  );

  const filtered = useMemo(() => {
    const byTab = suppliers.filter(TAB_FILTER[activeTab] ?? (() => true));
    const q = query.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.contact.toLowerCase().includes(q)
    );
  }, [suppliers, activeTab, query]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Suppliers"
        description="Manage your supplier register, documents and onboarding"
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
              href="/suppliers/new"
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Add Supplier
            </Link>
          </>
        }
        tabs={<TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />}
      />

      <div className="p-6 space-y-6 max-w-[1400px]">
        {/* KPIs */}
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Total Suppliers"      value={String(kpis.total)}            icon={Users2}        iconColor="text-brand-600"   iconBg="bg-brand-50" />
          <MetricCard label="Active"               value={String(kpis.preferred)}        icon={Star}           iconColor="text-violet-600"  iconBg="bg-violet-50" />
          <MetricCard label="Paused"               value={String(kpis.pending)}          icon={FileText}       iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Missing Documents"    value={String(kpis.missingDocs)}      icon={AlertTriangle}  iconColor="text-danger-600"  iconBg="bg-danger-50" />
          <MetricCard label="Insurance Expiring"   value={String(kpis.insuranceExpiring)} icon={Shield}        iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Avg Response Rate"    value={kpis.avgResponse}              icon={TrendingUp}    iconColor="text-success-600" iconBg="bg-success-50" />
        </KPIGrid>

        {/* Search toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suppliers..."
              className="text-sm text-surface-800 placeholder:text-surface-400 bg-transparent focus:outline-none w-full"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No suppliers found"
              description="Try a different filter or add a new supplier."
              action={
                <Link
                  href="/suppliers/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  Add Supplier
                </Link>
              }
              compact
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Supplier Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Docs</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Last Used</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filtered.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-surface-50 transition-colors group">
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/suppliers/${supplier.id}`}
                        className="font-medium text-surface-900 hover:text-brand-600 transition-colors"
                      >
                        {supplier.name}
                      </Link>
                      <p className="text-xs text-surface-400 mt-0.5">{supplier.contact}</p>
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{supplier.category}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{supplier.location}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={badgeStatus(supplier.status) as never} />
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <StatusBadge status={supplier.docsStatus} />
                    </td>
                    <td className="px-4 py-3.5 text-surface-400 text-xs hidden lg:table-cell whitespace-nowrap">
                      {supplier.lastUsed}
                    </td>
                    <td className="px-4 py-3.5">
                      <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-all">
                        <MoreHorizontal className="w-4 h-4" strokeWidth={1.8} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        <p className="text-xs text-surface-400">
          Showing {filtered.length} of {suppliers.length} suppliers
        </p>
      </div>
    </div>
  );
}
