import { KPIGrid, MetricCard } from "@/components/ui/MetricCard";
import type { LucideIcon } from "lucide-react";

export interface KpiItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}

/** Thin wrapper around the shared KPIGrid/MetricCard for the Suppliers/RFQs KPI rows. */
export function SupplierKpiRow({ items }: { items: KpiItem[] }) {
  return (
    <KPIGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {items.map((item) => (
        <MetricCard
          key={item.label}
          label={item.label}
          value={item.value}
          icon={item.icon}
          iconColor={item.iconColor}
          iconBg={item.iconBg}
        />
      ))}
    </KPIGrid>
  );
}
