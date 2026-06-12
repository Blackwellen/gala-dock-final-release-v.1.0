"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Archive, Tag, FileText, Image, Film } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const FILE = {
  id: "1",
  name: "gala_floorplan_v3.pdf",
  type: "PDF",
  kind: "Document",
  size: "2.1 MB",
  date: "9 Jun 2026",
  uploadedBy: "Emma Clarke",
  tags: ["floorplan", "gala", "venue"],
  usedIn: [
    { type: "Event",    name: "Spring Gala 2026",          href: "/events/1" },
    { type: "Supplier", name: "Prestige Venue Co.",         href: "/suppliers/1" },
  ],
};

function PreviewIcon({ kind }: { kind: string }) {
  if (kind === "Image") return <Image className="w-12 h-12 text-brand-400" strokeWidth={1.4} />;
  if (kind === "Video") return <Film  className="w-12 h-12 text-violet-400" strokeWidth={1.4} />;
  return <FileText className="w-12 h-12 text-danger-400" strokeWidth={1.4} />;
}

export default function FileDetailPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={FILE.name}
        description={`${FILE.type} · ${FILE.size}`}
        actions={
          <>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              <Download className="w-4 h-4" />
              Download
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-4xl space-y-6">
        {/* Large preview */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="h-72 bg-surface-50 flex flex-col items-center justify-center gap-3 border-b border-surface-200">
            <PreviewIcon kind={FILE.kind} />
            <p className="text-sm font-medium text-surface-500">{FILE.name}</p>
            <p className="text-xs text-surface-400">{FILE.type} · {FILE.size}</p>
          </div>
          <div className="p-6">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
              {[
                { label: "File Name",    value: FILE.name },
                { label: "Type",         value: FILE.type },
                { label: "Size",         value: FILE.size },
                { label: "Uploaded",     value: FILE.date },
                { label: "Uploaded By",  value: FILE.uploadedBy },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-surface-900 truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Tags */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-surface-400" strokeWidth={1.8} />
            <h3 className="text-sm font-semibold text-surface-900">Tags</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILE.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-100">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Used in */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Used In</h3>
          <div className="space-y-2">
            {FILE.usedIn.map((ref, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface-50 border border-surface-100 hover:bg-surface-100 transition-colors">
                <div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-surface-200 text-surface-500 mr-2">
                    {ref.type}
                  </span>
                  <span className="text-sm font-medium text-surface-900">{ref.name}</span>
                </div>
                <button
                  onClick={() => router.push(ref.href)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
