import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { formatDate, formatBytes, DOC_TYPE_LABEL } from "../../lib";
import { DocumentUploadForm } from "./DocumentUploadForm";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

function docBadgeStatus(status: string): string {
  if (status === "expiring-soon") return "due-soon";
  if (status === "expired") return "expired";
  return "active";
}

export default async function VenueDocumentsPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: documents } = await supabase
    .from("venue_documents")
    .select("id, doc_type, category, filename, file_size_bytes, expiry_date, status, version, created_at")
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const rows = documents ?? [];
  const expiring = rows.filter((d) => d.status === "expiring-soon" || d.status === "expired");

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Total Documents</p>
            <p className="text-2xl font-bold text-surface-900">{rows.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Expiring Soon</p>
            <p className="text-2xl font-bold text-surface-900">{expiring.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card px-4 py-3">
            <p className="text-xs text-surface-500 uppercase tracking-wide">Signed Contracts</p>
            <p className="text-2xl font-bold text-surface-900">
              {rows.filter((d) => (d.category ?? d.doc_type) === "contracts" && d.status !== "expired").length}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={FileText} title="No documents yet" description="Upload the venue brochure, floor plans, contracts and compliance documents." compact />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">File Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Version</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden xl:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                        <span className="font-medium text-surface-800 truncate">{d.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{DOC_TYPE_LABEL[d.category ?? d.doc_type] ?? d.doc_type}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{formatBytes(d.file_size_bytes)}</td>
                    <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">v{d.version ?? 1}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={docBadgeStatus(d.status) as never} /></td>
                    <td className="px-4 py-3.5 text-surface-400 text-xs hidden xl:table-cell whitespace-nowrap">{formatDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <InsightCard title="Expiry Alerts">
          {expiring.length === 0 ? (
            <p className="text-sm text-surface-400">Nothing expiring soon.</p>
          ) : (
            <div className="space-y-2">
              {expiring.slice(0, 5).map((d) => (
                <div key={d.id} className="text-sm">
                  <p className="font-medium text-surface-800 truncate">{d.filename}</p>
                  <p className="text-xs text-warning-600">Expires {d.expiry_date ? formatDate(d.expiry_date) : "soon"}</p>
                </div>
              ))}
            </div>
          )}
        </InsightCard>
        <InsightCard title="Upload Document">
          <DocumentUploadForm venueId={venueId} />
        </InsightCard>
      </div>
    </div>
  );
}
