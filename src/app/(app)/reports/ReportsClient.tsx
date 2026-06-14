"use client";

import { useState } from "react";
import { TabNav } from "@/components/ui/TabNav";
import type { ReportsData } from "./data";
import { OverviewTab } from "./tabs/OverviewTab";
import { RevenueTab } from "./tabs/RevenueTab";
import { EventsTab } from "./tabs/EventsTab";
import { SuppliersTab } from "./tabs/SuppliersTab";
import { TeamTab } from "./tabs/TeamTab";
import { ClientsTab } from "./tabs/ClientsTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "revenue", label: "Revenue" },
  { id: "events", label: "Events" },
  { id: "suppliers", label: "Suppliers" },
  { id: "team", label: "Team" },
  { id: "clients", label: "Clients" },
];

export function ReportsClient({ data }: { data: ReportsData }) {
  const [active, setActive] = useState("overview");

  return (
    <div>
      <div className="bg-white border-b border-surface-200 px-6">
        <TabNav tabs={TABS} active={active} onChange={setActive} />
      </div>
      <div className="p-6">
        {active === "overview" && <OverviewTab data={data.overview} />}
        {active === "revenue" && <RevenueTab data={data.revenue} />}
        {active === "events" && <EventsTab data={data.events} />}
        {active === "suppliers" && <SuppliersTab data={data.suppliers} />}
        {active === "team" && <TeamTab data={data.team} />}
        {active === "clients" && <ClientsTab data={data.clients} />}
      </div>
    </div>
  );
}
