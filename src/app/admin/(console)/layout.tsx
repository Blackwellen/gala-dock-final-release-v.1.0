import type { Metadata } from "next";
import "@/styles/workspace.css";
import { AdminShell } from "@/components/workspace/shell";
import { getAdmin } from "@/lib/admin/context";
import { adminShellData } from "@/lib/admin/shell-data";

export const metadata: Metadata = { title: { template: "%s · Gala Dock Admin", default: "Platform Admin · Gala Dock" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdmin();
  const shell = await adminShellData(ctx);
  return <AdminShell user={{ name: ctx.name, title: ctx.title, avatar: ctx.avatar }} permissions={[...ctx.permissions]}
    counts={shell.counts} alerts={shell.alerts} support={shell.support}>{children}</AdminShell>;
}
