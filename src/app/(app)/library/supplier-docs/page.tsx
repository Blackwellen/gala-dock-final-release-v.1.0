"use client";

import { useRouter } from "next/navigation";
import { Upload, Download, Eye } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

type DocStatus = "verified" | "missing" | "pending" | "archived";

const SUPPLIER_DOCS = [
  {
    id: "1",
    supplier: "Noble Kitchen Co.",
    docType: "Food Hygiene Certificate",
    status: "verified" as DocStatus,
    expiry: "30 Jun 2027",
    uploadedDate: "5 Jan 2026",
  },
  {
    id: "2",
    supplier: "AV Pro Solutions",
    docType: "Public Liability Insurance",
    status: "verified" as DocStatus,
    expiry: "1 Apr 2027",
    uploadedDate: "12 Feb 2026",
  },
  {
    id: "3",
    supplier: "Bloom Floral Studio",
    docType: "Public Liability Insurance",
    status: "missing" as DocStatus,
    expiry: "—",
    uploadedDate: "—",
  },
  {
    id: "4",
    supplier: "Starlight Events",
    docType: "PAT Test Certificate",
    status: "pending" as DocStatus,
    expiry: "—",
    uploadedDate: "8 Jun 2026",
  },
  {
    id: "5",
    supplier: "Prestige Catering",
    docType: "Food Safety Management Plan",
    status: "verified" as DocStatus,
    expiry: "15 Dec 2026",
    uploadedDate: "20 Mar 2026",
  },
];

// Map DocStatus to the StatusBadge union — verified/missing/pending/archived all exist
const STATUS_MAP: Record<DocStatus, "verified" | "missing" | "pending" | "archived"> = {
  verified: "verified",
  missing:  "missing",
  pending:  "pending",
  archived: "archived",
};

export default function SupplierDocsPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Supplier Documents"
        description="Compliance certificates, insurance and legal documents from suppliers"
        actions={
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Document
            <input type="file" className="hidden" />
          </label>
        }
      />

      <div className="flex-1 p-6">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm divide-y divide-surface-100">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Doc Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Expiry</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {SUPPLIER_DOCS.map((doc) => (
                  <tr key={doc.id} className="group hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-surface-900">{doc.supplier}</td>
                    <td className="px-6 py-3 text-surface-600">{doc.docType}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={STATUS_MAP[doc.status]} />
                    </td>
                    <td className="px-6 py-3 text-surface-500">{doc.expiry}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {doc.status !== "missing" && (
                          <>
                            <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-all" title="View">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-all" title="Download">
                              <Download className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {doc.status === "missing" && (
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger-50 text-danger-700 border border-danger-100 text-xs font-medium hover:bg-danger-100 transition-colors cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            Upload
                            <input type="file" className="hidden" />
                          </label>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
