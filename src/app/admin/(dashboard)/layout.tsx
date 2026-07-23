import { requirePlatformAdmin } from "@/lib/admin";
import { AdminShellClient } from "./AdminShellClient";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return <AdminShellClient>{children}</AdminShellClient>;
}
