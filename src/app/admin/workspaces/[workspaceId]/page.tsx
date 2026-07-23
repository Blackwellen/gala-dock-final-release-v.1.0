import { requirePlatformAdmin } from "@/lib/admin";
import { WorkspaceDetailPageClient } from "./WorkspaceDetailPageClient";

export default async function WorkspaceDetailPage() {
  await requirePlatformAdmin();
  return <WorkspaceDetailPageClient />;
}
