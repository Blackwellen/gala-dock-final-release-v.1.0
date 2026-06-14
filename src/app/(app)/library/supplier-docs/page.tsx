import Link from "next/link";
import { Upload, FileCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { kindLabel, formatBytes, formatLibDate, type LibraryKind } from "../library-utils";

export const metadata = { title: "Supplier Documents" };

const SUPPLIER_KINDS: LibraryKind[] = ["contract", "rider"];

export default async function SupplierDocsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("library_assets")
    .select("id, title, kind, size_bytes, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("kind", SUPPLIER_KINDS)
    .order("created_at", { ascending: false });

  const docs = assets ?? [];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Supplier Documents"
        description="Contracts and riders associated with your suppliers"
        actions={
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Document
            <input type="file" className="hidden" />
          </label>
        }
      />

      <div className="flex-1 p-6">
        {docs.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={FileCheck}
              title="No supplier documents yet"
              description="Upload supplier contracts and riders to keep compliance documents in one place."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Document</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="group hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-surface-900">
                        <Link href={`/library/files/${doc.id}`} className="hover:text-brand-600">
                          {doc.title}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                          {kindLabel(doc.kind)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-surface-500">{formatBytes(doc.size_bytes)}</td>
                      <td className="px-6 py-3 text-surface-500">{formatLibDate(doc.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
