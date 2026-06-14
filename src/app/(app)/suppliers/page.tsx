"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all",       label: "All Suppliers",       count: 47 },
  { id: "preferred", label: "Preferred",           count: 12 },
  { id: "pending",   label: "Pending Onboarding",  count: 8, badge: "warning" as const },
  { id: "missing",   label: "Missing Documents",   count: 6, badge: "danger" as const },
  { id: "recent",   label: "Recently Used" },
  { id: "archived",  label: "Archived" },
];

const SUPPLIERS = [
  {
    id: "s1",
    name: "Noble Kitchen Co.",
    category: "Catering",
    location: "Bristol, UK",
    status: "preferred" as const,
    docs: "verified" as const,
    lastUsed: "2 Jun 2026",
    contact: "Sarah Noble",
  },
  {
    id: "s2",
    name: "SoundWave Events",
    category: "AV / Production",
    location: "London, UK",
    status: "active" as const,
    docs: "pending" as const,
    lastUsed: "14 Jun 2026",
    contact: "Marcus Reed",
  },
  {
    id: "s3",
    name: "Lena Marsh Photography",
    category: "Photography",
    location: "Bath, UK",
    status: "preferred" as const,
    docs: "verified" as const,
    lastUsed: "14 Jun 2026",
    contact: "Lena Marsh",
  },
  {
    id: "s4",
    name: "Bloom & Wild Florals",
    category: "Florist",
    location: "Cheltenham, UK",
    status: "pending" as const,
    docs: "missing" as const,
    lastUsed: "—",
    contact: "Clara Hughes",
  },
  {
    id: "s5",
    name: "The Bristol Quartet",
    category: "Band / Music",
    location: "Bristol, UK",
    status: "preferred" as const,
    docs: "verified" as const,
    lastUsed: "5 Jul 2026",
    contact: "James Avery",
  },
  {
    id: "s6",
    name: "Elite Security Group",
    category: "Security",
    location: "Birmingham, UK",
    status: "active" as const,
    docs: "verified" as const,
    lastUsed: "28 Jun 2026",
    contact: "Craig Forster",
  },
  {
    id: "s7",
    name: "Prestige Coach Hire",
    category: "Transport",
    location: "Swindon, UK",
    status: "active" as const,
    docs: "pending" as const,
    lastUsed: "12 Jul 2026",
    contact: "Donna Price",
  },
  {
    id: "s8",
    name: "Glam & Grace Hair Studio",
    category: "Hair & Makeup",
    location: "London, UK",
    status: "preferred" as const,
    docs: "verified" as const,
    lastUsed: "20 Jul 2026",
    contact: "Priya Shah",
  },
  {
    id: "s9",
    name: "Thornbury Catering Co.",
    category: "Catering",
    location: "Thornbury, UK",
    status: "pending" as const,
    docs: "missing" as const,
    lastUsed: "—",
    contact: "Owen Davies",
  },
  {
    id: "s10",
    name: "Apex AV Solutions",
    category: "AV / Production",
    location: "Manchester, UK",
    status: "archived" as const,
    docs: "verified" as const,
    lastUsed: "Jan 2026",
    contact: "Neil Barker",
  },
];

const TAB_FILTER: Record<string, (s: typeof SUPPLIERS[0]) => boolean> = {
  all:       () => true,
  preferred: (s) => s.status === "preferred",
  pending:   (s) => s.status === "pending",
  missing:   (s) => s.docs === "missing",
  recent:    (s) => s.lastUsed !== "—" && s.status !== "archived",
  archived:  (s) => s.status === "archived",
};

export default function SuppliersPage() {
  const [activeTab, setActiveTab] = useState("all");

  const filtered = SUPPLIERS.filter(TAB_FILTER[activeTab] ?? (() => true));

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
        tabs={<TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />}
      />

      <div className="p-6 space-y-6 max-w-[1400px]">
        {/* KPIs */}
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Total Suppliers"      value="47" icon={Users2}        iconColor="text-brand-600"   iconBg="bg-brand-50" />
          <MetricCard label="Preferred"            value="12" icon={Star}           iconColor="text-violet-600"  iconBg="bg-violet-50" />
          <MetricCard label="Quotes Pending"       value="9"  icon={FileText}       iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Missing Documents"    value="6"  icon={AlertTriangle}  iconColor="text-danger-600"  iconBg="bg-danger-50" />
          <MetricCard label="Insurance Expiring"   value="3"  icon={Shield}         iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Avg Response Rate"    value="78%" icon={TrendingUp}    iconColor="text-success-600" iconBg="bg-success-50" />
        </KPIGrid>

        {/* Search toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 border border-surface-200 rounded-lg bg-white flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
            <input
              type="text"
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
                      <StatusBadge status={supplier.status} />
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <StatusBadge status={supplier.docs} />
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
          Showing {filtered.length} of {SUPPLIERS.length} suppliers
        </p>
      </div>
    </div>
  );
}
