import type { Metadata } from "next";
import "@/styles/kit.css";
import "@/styles/organizer.css";
import "@/styles/org-events.css";
import "@/styles/org-event.css";
import "@/styles/org-calendar.css";
import "@/styles/org-sales.css";
import "@/styles/org-wizard.css";
import "@/styles/org-market.css";
import "@/styles/cu-book.css";
import "@/styles/cu-plan-wizard.css";
import "@/styles/ticket-setup.css";
import "@/styles/org-tickets.css";
import "@/styles/org-team.css";
import "@/styles/org-money.css";
import "@/styles/org-invoice-wizard.css";
import "@/styles/org-settings.css";
import "@/styles/org-agent.css";
import "@/styles/org-create-event.css";
import "@/styles/org-template.css";
import "@/styles/org-promotion.css";
import "@/styles/org-poster.css";
import { KitProviders } from "@/components/kit/client";
import { OrganizerShell } from "@/components/organizer/shell";
import { getOrganizer } from "@/lib/data/context";

export const metadata: Metadata = { title: { default: "Organizer · Gala Dock", template: "%s · Gala Dock Organizer" }, manifest: "/organizer.webmanifest" };

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrganizer();
  const { data: events } = await ctx.supabase.from("events").select("id,name").eq("workspace_id", ctx.workspace.id);
  const names = new Map((events ?? []).map(e => [e.id, e.name]));
  const { data: threads } = names.size
    ? await ctx.supabase.from("threads").select("id,title,event_id,updated_at").in("event_id", [...names.keys()]).order("updated_at", { ascending: false }).limit(6)
    : { data: [] };
  return <KitProviders>
    <OrganizerShell
      user={{ name: ctx.name, email: ctx.user.email ?? "" }}
      workspace={{ id: ctx.workspace.id, name: ctx.workspace.name, kind: ctx.workspace.kind, role: ctx.role, cover_image: ctx.workspace.cover_image }}
      workspaces={ctx.workspaces.map(w => ({ id: w.id, name: w.name, kind: w.kind, role: w.role }))}
      unread={ctx.unread}
      notifications={ctx.notifications}
      threads={(threads ?? []).map(t => ({ id: t.id, title: t.title, event: names.get(t.event_id) ?? "", href: `/organizer/events/${t.event_id}?tab=plan&section=suppliers`, at: t.updated_at }))}
    >{children}</OrganizerShell>
  </KitProviders>;
}
