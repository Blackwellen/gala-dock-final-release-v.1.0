// Gala Dock — persona dashboards (venue operator + supplier workspaces). Rendered by the home
// page when workspace_type is venue/supplier, so each persona gets a tailored home instead of the
// organizer dashboard. Server components — workspace-scoped, real counts, premium empty states.

import Link from "next/link";
import { Hotel, CalendarRange, Banknote, Briefcase, ClipboardList, Store, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { createClient } from "@/lib/supabase/server";

async function countOf(table: "venues" | "venue_bookings" | "rfqs" | "tasks", workspaceId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

function GettingStarted({ steps }: { steps: { href: string; label: string }[] }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-surface-900 mb-3">Get started</h2>
      <div className="space-y-2">
        {steps.map((s) => (
          <Link key={s.href} href={s.href} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-surface-200 hover:bg-surface-50 text-sm text-surface-700">
            <span>{s.label}</span>
            <ArrowRight className="w-4 h-4 text-surface-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export async function VenueDashboard({ workspaceId }: { workspaceId: string }) {
  const [venues, bookings] = await Promise.all([countOf("venues", workspaceId), countOf("venue_bookings", workspaceId)]);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Venue Operator" description="Manage your venues, availability and bookings." />
      <div className="px-6 lg:px-8 pb-8 space-y-5">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3">
          <MetricCard label="My venues" value={String(venues)} icon={Hotel} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Bookings" value={String(bookings)} icon={CalendarRange} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Revenue (mo)" value="—" icon={Banknote} iconColor="text-surface-600" iconBg="bg-surface-100" />
        </KPIGrid>
        <GettingStarted
          steps={[
            { href: "/event-manager/venue-management", label: "Add your first venue / space" },
            { href: "/event-manager/calendar", label: "Set your availability" },
            { href: "/event-manager/settings", label: "Complete your operator profile" },
          ]}
        />
      </div>
    </div>
  );
}

export async function SupplierDashboard({ workspaceId }: { workspaceId: string }) {
  const [rfqs, tasks] = await Promise.all([countOf("rfqs", workspaceId), countOf("tasks", workspaceId)]);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Supplier" description="Your jobs, RFQs and earnings." />
      <div className="px-6 lg:px-8 pb-8 space-y-5">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3">
          <MetricCard label="Open RFQs" value={String(rfqs)} icon={ClipboardList} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Jobs" value={String(tasks)} icon={Briefcase} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Earnings (mo)" value="—" icon={Banknote} iconColor="text-surface-600" iconBg="bg-surface-100" />
        </KPIGrid>
        <GettingStarted
          steps={[
            { href: "/event-manager/settings", label: "Complete your supplier profile & services" },
            { href: "/event-manager/rfqs", label: "Respond to RFQs" },
            { href: "/event-manager/marketplace/listings", label: "List in the marketplace" },
          ]}
        />
      </div>
    </div>
  );
}
