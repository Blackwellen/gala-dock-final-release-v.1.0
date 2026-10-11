import type { Metadata } from "next";
import { Suspense } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import { KitProviders } from "@/components/kit/client";
import { CustomerShell } from "@/components/customer/shell";
import { getCustomer } from "@/lib/data/context";
import { listWorkspaceAccess } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Gala Dock", template: "%s · Gala Dock" }, manifest: "/customer.webmanifest" };

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCustomer();
  const [{ data: events }, access] = await Promise.all([
    ctx.supabase.from("events").select("id").eq("owner_id", ctx.user.id).eq("management", "consumer"),
    listWorkspaceAccess(ctx.supabase),
  ]);
  const ids = (events ?? []).map(e => e.id);
  const { data: threads } = ids.length ? await ctx.supabase.from("threads").select("id,title,event_id,updated_at,messages(read_at,from_provider)").in("event_id", ids).order("updated_at", { ascending: false }).limit(6) : { data: [] };
  return <KitProviders><Suspense>
    <CustomerShell
      user={{ name: ctx.name, email: ctx.user.email ?? "", avatar: ctx.profile?.avatar_url }}
      unread={ctx.unread}
      notifications={ctx.notifications}
      hasWorkspace={access.some(w => w.kind === "organizer" && w.member_status === "active" && w.onboarding_complete)}
      threads={(threads ?? []).map(t => ({ id: t.id, title: t.title, href: `/account/events/${t.event_id}/messages?thread=${t.id}`, at: t.updated_at, unread: (t.messages ?? []).some(m => m.from_provider && !m.read_at) }))}
    >{children}</CustomerShell>
  </Suspense></KitProviders>;
}
