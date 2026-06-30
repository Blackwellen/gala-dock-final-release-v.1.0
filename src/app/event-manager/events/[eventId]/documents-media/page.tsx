import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { FileText, Image, Video, File, Download, Search, FolderOpen } from "lucide-react";
import { DocumentUploadButton, DocumentUploadEmptyButton } from "./DocumentUploadClient";

export const dynamic = "force-dynamic";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  pdf:      <FileText className="h-4 w-4 text-red-500" />,
  image:    <Image className="h-4 w-4 text-blue-500" />,
  video:    <Video className="h-4 w-4 text-violet-500" />,
  doc:      <FileText className="h-4 w-4 text-blue-600" />,
  other:    <File className="h-4 w-4 text-surface-400" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  contract:     "bg-violet-100 text-violet-700",
  proposal:     "bg-blue-100 text-blue-700",
  invoice:      "bg-amber-100 text-amber-700",
  media:        "bg-pink-100 text-pink-700",
  floor_plan:   "bg-teal-100 text-teal-700",
  brief:        "bg-indigo-100 text-indigo-700",
  report:       "bg-green-100 text-green-700",
  other:        "bg-surface-100 text-surface-500",
};

import React from "react";

interface EventFile {
  id: string;
  filename: string | null;
  mime_type: string | null;
  tags: string[] | null;
  size_bytes: number | null;
  created_at: string | null;
  uploaded_by: string | null;
  storage_key: string | null;
  caption: string | null;
}

function fmtSize(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(filename: string | null, mimeType: string | null): string {
  const ext = (filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "webm"].includes(ext)) return "video";
  if (mime.includes("word") || ["doc", "docx", "txt"].includes(ext)) return "doc";
  return "other";
}

export default async function DocumentsMediaPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  const { data: docsData, count: total } = await supabase
    .from("event_files")
    .select("id, filename, mime_type, tags, size_bytes, created_at, uploaded_by, storage_key, caption", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  const docs = (docsData ?? []) as EventFile[];

  const byCategory = new Map<string, EventFile[]>();
  for (const d of docs) {
    const c = (d.tags ?? [])[0] ?? "other";
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(d);
  }

  const images = docs.filter((d) => getFileType(d.filename, d.mime_type) === "image").length;
  const videos = docs.filter((d) => getFileType(d.filename, d.mime_type) === "video").length;
  const pdfs = docs.filter((d) => getFileType(d.filename, d.mime_type) === "pdf").length;
  const other = docs.length - images - videos - pdfs;

  return (
    <div className="space-y-6 p-6 pb-12 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-surface-900">Documents & Media</h2>
          <p className="text-sm text-surface-500">{total ?? 0} files · {images} images · {videos} videos · {pdfs} PDFs</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 shadow-sm">
            <Download className="h-4 w-4" />
            Export all
          </button>
          <DocumentUploadButton eventId={eventId} />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Files", value: total ?? 0, icon: <File className="h-5 w-5 text-surface-500" />, bg: "bg-surface-50" },
          { label: "Images", value: images, icon: <Image className="h-5 w-5 text-blue-500" />, bg: "bg-blue-50" },
          { label: "Videos", value: videos, icon: <Video className="h-5 w-5 text-violet-500" />, bg: "bg-violet-50" },
          { label: "PDFs / Docs", value: pdfs + other, icon: <FileText className="h-5 w-5 text-red-500" />, bg: "bg-red-50" },
        ].map(({ label, value, icon, bg }) => (
          <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 shadow-card flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>{icon}</span>
            <div>
              <p className="text-xl font-bold text-surface-900">{value}</p>
              <p className="text-xs text-surface-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search documents and media…"
            className="w-full rounded-lg border border-surface-200 bg-white pl-9 pr-3 py-2 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            readOnly
          />
        </div>
        <select className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 shadow-sm">
          <option>All Categories</option>
          <option>Contracts</option>
          <option>Proposals</option>
          <option>Invoices</option>
          <option>Media</option>
          <option>Floor Plans</option>
        </select>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-surface-200 bg-white shadow-card py-16 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-surface-300 mb-3" />
          <p className="text-sm font-medium text-surface-900">No documents or media yet</p>
          <p className="text-xs text-surface-400 mt-1">Upload contracts, briefs, floor plans, photos and more.</p>
          <DocumentUploadEmptyButton eventId={eventId} />
        </div>
      ) : (
        <div className="space-y-6">
          {[...byCategory.entries()].map(([category, catDocs]) => {
            const catCls = CATEGORY_COLORS[category.toLowerCase()] ?? CATEGORY_COLORS.other;
            return (
              <div key={category}>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${catCls}`}>{category.replace("_", " ")}</span>
                  <span className="text-xs text-surface-400">{catDocs.length} file{catDocs.length !== 1 ? "s" : ""}</span>
                  <div className="flex-1 h-px bg-surface-200" />
                </div>
                <div className="rounded-xl border border-surface-200 bg-white shadow-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100 bg-surface-50">
                        <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Name</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Type</th>
                        <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Size</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Uploaded by</th>
                        <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-surface-500">Date</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {catDocs.map((doc) => {
                        const ft = getFileType(doc.filename, doc.mime_type);
                        const extLabel = (doc.mime_type ?? doc.filename ?? "").split("/").pop()?.toUpperCase() ?? "FILE";
                        return (
                          <tr key={doc.id} className="hover:bg-surface-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                {TYPE_ICONS[ft] ?? TYPE_ICONS.other}
                                <span className="font-medium text-surface-900 truncate max-w-[220px]">{doc.filename ?? "Unnamed file"}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs uppercase text-surface-500">{extLabel}</td>
                            <td className="px-5 py-3 text-right text-xs text-surface-500">{fmtSize(doc.size_bytes)}</td>
                            <td className="px-5 py-3 text-xs text-surface-600">{doc.caption ?? doc.uploaded_by ?? "—"}</td>
                            <td className="px-5 py-3 text-right text-xs text-surface-400">
                              {doc.created_at ? new Date(doc.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <button className="text-xs text-brand-600 hover:underline">View</button>
                                <button className="text-xs text-surface-400 hover:text-surface-700">Download</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
