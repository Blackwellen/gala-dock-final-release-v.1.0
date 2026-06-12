"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Image, Film, File } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

type FileKind = "All" | "Images" | "Documents" | "Video";

const FILES = [
  { id: "1", name: "gala_floorplan_v3.pdf",    type: "PDF",  kind: "Documents" as const, size: "2.1 MB", date: "9 Jun 2026",  uploadedBy: "Emma Clarke" },
  { id: "2", name: "hartley_wedding_hero.jpg", type: "JPG",  kind: "Images"    as const, size: "4.8 MB", date: "7 Jun 2026",  uploadedBy: "James Smith" },
  { id: "3", name: "techsummit_av_brief.docx", type: "DOCX", kind: "Documents" as const, size: "340 KB", date: "5 Jun 2026",  uploadedBy: "Emma Clarke" },
  { id: "4", name: "carter_catering_menu.pdf", type: "PDF",  kind: "Documents" as const, size: "820 KB", date: "3 Jun 2026",  uploadedBy: "Sarah Patel" },
  { id: "5", name: "brand_logo_primary.svg",   type: "SVG",  kind: "Images"    as const, size: "18 KB",  date: "1 Jun 2026",  uploadedBy: "James Smith" },
  { id: "6", name: "spring_gala_recap.mp4",    type: "MP4",  kind: "Video"     as const, size: "128 MB", date: "28 May 2026", uploadedBy: "Emma Clarke" },
];

const FILTER_TYPES: FileKind[] = ["All", "Images", "Documents", "Video"];

function FileIcon({ kind, type }: { kind: string; type: string }) {
  if (kind === "Images") return <Image className="w-6 h-6 text-brand-600" strokeWidth={1.8} />;
  if (kind === "Video")  return <Film  className="w-6 h-6 text-violet-600" strokeWidth={1.8} />;
  if (type === "PDF")    return <FileText className="w-6 h-6 text-danger-600" strokeWidth={1.8} />;
  return <File className="w-6 h-6 text-surface-500" strokeWidth={1.8} />;
}

function kindBg(kind: string) {
  if (kind === "Images")    return "bg-brand-50";
  if (kind === "Video")     return "bg-violet-50";
  if (kind === "Documents") return "bg-danger-50";
  return "bg-surface-100";
}

export default function FilesPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FileKind>("All");

  const filtered = activeFilter === "All" ? FILES : FILES.filter((f) => f.kind === activeFilter);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Files"
        description="All uploaded files across your events and suppliers"
        actions={
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Files
            <input type="file" className="hidden" multiple />
          </label>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Filter chips */}
        <div className="flex items-center gap-2">
          {FILTER_TYPES.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === f
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-surface-600 border-surface-200 hover:border-surface-300"
              }`}
            >
              {f}
            </button>
          ))}
          <span className="ml-auto text-xs text-surface-400">{filtered.length} files</span>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filtered.map((file) => (
            <button
              key={file.id}
              onClick={() => router.push(`/library/files/${file.id}`)}
              className="group bg-white rounded-xl border border-surface-200 shadow-card hover:border-brand-200 hover:shadow-md transition-all overflow-hidden text-left"
            >
              {/* Thumbnail */}
              <div className={`h-28 flex items-center justify-center ${kindBg(file.kind)}`}>
                <FileIcon kind={file.kind} type={file.type} />
              </div>
              {/* Meta */}
              <div className="p-3">
                <p className="text-xs font-medium text-surface-900 truncate leading-tight">{file.name}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-100 text-surface-500">
                    {file.type}
                  </span>
                  <span className="text-[10px] text-surface-400">{file.size}</span>
                </div>
                <p className="text-[10px] text-surface-400 mt-1">{file.date}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
