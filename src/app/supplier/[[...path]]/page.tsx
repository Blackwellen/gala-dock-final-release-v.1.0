import { WorkspaceTypeShell } from "@/components/layout/WorkspaceTypeShell";

export default async function SupplierShellPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return <WorkspaceTypeShell type="supplier" path={path ?? []} />;
}
