import { requireRole } from "@/lib/auth";
import { WorkspacePlaceholder } from "@/components/workspace-placeholder";

export default async function Page() {
  await requireRole("admin");
  return <WorkspacePlaceholder title="Platform Admin" subtitle="Verified with multi-factor authentication." />;
}
