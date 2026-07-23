import { WorkspaceTypeShell } from "@/components/layout/WorkspaceTypeShell";

export default async function VenueShellPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return <WorkspaceTypeShell type="venue" path={path ?? []} />;
}
