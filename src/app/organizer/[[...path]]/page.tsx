import { WorkspaceTypeShell } from "@/components/layout/WorkspaceTypeShell";

export default async function OrganizerShellPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return <WorkspaceTypeShell type="organizer" path={path ?? []} />;
}
