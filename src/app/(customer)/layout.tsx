import type { Metadata } from "next";
import { Suspense } from "react";
import "@/styles/kit.css";
import "@/styles/customer.css";
import "@/styles/cu-discover.css";
import "@/styles/cu-events.css";
import "@/styles/cu-event.css";
import "@/styles/cu-build.css";
import "@/styles/cu-plan.css";
import "@/styles/cu-ops.css";
import "@/styles/cu-book.css";
import "@/styles/cu-plan-wizard.css";
import "@/styles/cu-tickets.css";
import "@/styles/cu-saved.css";
import "@/styles/cu-reviews.css";
import "@/styles/cu-account.css";
import "@/styles/cu-home.css";
import "@/styles/ticket-setup.css";
import { KitProviders } from "@/components/kit/client";
import { CustomerShell } from "@/components/customer/shell";
import { getCustomer } from "@/lib/data/context";
import { recentConversations } from "@/lib/messaging/recent";
import { listWorkspaceAccess } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Gala Dock", template: "%s · Gala Dock" }, manifest: "/customer.webmanifest" };

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCustomer();
  const [threads, access] = await Promise.all([recentConversations(ctx.supabase as never, null, "/account/inbox"), listWorkspaceAccess(ctx.supabase)]);
  return <KitProviders><Suspense>
    <CustomerShell
      user={{ name: ctx.name, email: ctx.user.email ?? "", avatar: ctx.profile?.avatar_url }}
      unread={ctx.unread}
      notifications={ctx.notifications}
      hasWorkspace={access.some(w => w.kind === "organizer" && w.member_status === "active" && w.onboarding_complete)}
      threads={threads}
    >{children}</CustomerShell>
  </Suspense></KitProviders>;
}
