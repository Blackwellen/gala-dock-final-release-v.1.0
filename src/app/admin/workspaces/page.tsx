import { requirePlatformAdmin } from "@/lib/admin";
import { WorkspacesPageClient } from "./WorkspacesPageClient";

export default async function WorkspacesPage() {
  await requirePlatformAdmin();
  return <WorkspacesPageClient />;
}
