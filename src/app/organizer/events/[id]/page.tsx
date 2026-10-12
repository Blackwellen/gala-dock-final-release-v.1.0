import { parseRange } from "@/components/organizer/event/range-links";
import type { Metadata } from "next";
import { getOrganizer } from "@/lib/data/context";
import { getProEvent, loadEventData } from "@/lib/data/event";
import { EventHeader, type EventTab } from "@/components/organizer/event/header";
import { Overview } from "@/components/organizer/event/overview";
import { PlanTab } from "@/components/organizer/event/plan";
import { SellTab } from "@/components/organizer/event/sell";
import { OpsTab } from "@/components/organizer/event/ops";
import { MoneyTab } from "@/components/organizer/event/money";

export async function generateMetadata({ params }: PageProps<"/organizer/events/[id]">): Promise<Metadata> {
  const { id } = await params; const ctx = await getOrganizer();
  const { data } = await ctx.supabase.from("events").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Event" };
}

export default async function EventProfile({ params, searchParams }: PageProps<"/organizer/events/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getOrganizer();
  const e = await getProEvent(ctx, id);
  const tabs = ["overview", "plan", "sell", "operations", "money"] as const;
  let tab = (tabs.includes(sp.tab as EventTab) ? sp.tab : "overview") as EventTab;
  if (tab === "money" && !ctx.canMoney) tab = "overview";
  const section = typeof sp.section === "string" ? sp.section : "";
  const d = await loadEventData(ctx, e.id, parseRange(sp.range));
  return <>
    <EventHeader e={e} tab={tab} canMoney={ctx.canMoney} />
    {tab === "overview" && <Overview e={e} d={d} me={{ name: ctx.name }} canMoney={ctx.canMoney} />}
    {tab === "plan" && <PlanTab e={e} d={d} section={section} role={ctx.role} />}
    {tab === "sell" && <SellTab e={e} d={d} section={section} />}
    {tab === "operations" && <OpsTab e={e} d={d} section={section} phase={["pre", "live", "post"].includes(String(sp.phase)) ? String(sp.phase) : "all"} />}
    {tab === "money" && <MoneyTab e={e} d={d} section={section} />}
  </>;
}
