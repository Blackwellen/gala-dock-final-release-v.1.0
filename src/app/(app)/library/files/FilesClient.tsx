"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Image as ImageIcon, Film, File, Files as FilesIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export type FileCategory = "All" | "Images" | "Documents" | "Video";

export interface FileRow {
  id: string;
  title: string;
  category: Exclude<FileCategory, "All">;
  typeLabel: string;
  size: string;
  date: string;
}

const FILTER_TYPES: FileCategory[] = ["All", "Images", "Documents", "Video"];

function FileIcon({ category, typeLabel }: { category: string; typeLabel: string }) {
  if (category === "Images") return <ImageIcon className="w-6 h-6 text-brand-600" strokeWidth={1.8} />;
  if (category === "Video") return <Film className="w-6 h-6 text-violet-600" strokeWidth={1.8} />;
  if (typeLabel.includes("PDF")) return <FileText className="w-6 h-6 text-danger-600" strokeWidth={1.8} />;
  return <File className="w-6 h-6 text-surface-500" strokeWidth={1.8} />;
}

function kindBg(category: string) {
  if (category === "Images") return "bg-brand-50";
  if (category === "Video") return "bg-violet-50";
  if (category === "Documents") return "bg-danger-50";
  return "bg-surface-100";
}

export function FilesClient({ files }: { files: FileRow[] }) {
  const [activeFilter, setActiveFilter] = useState<FileCategory>("All");

  const filtered = activeFilter === "All" ? files : files.filter((f) => f.category === activeFilter);

  return (
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

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState
            icon={FilesIcon}
            title="No files yet"
            description="Upload images, documents and videos to build your library."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filtered.map((file) => (
            <Link
              key={file.id}
              href={`/library/files/${file.id}`}
              className="group bg-white rounded-xl border border-surface-200 shadow-card hover:border-brand-200 hover:shadow-md transition-all overflow-hidden text-left"
            >
              {/* Thumbnail */}
              <div className={`h-28 flex items-center justify-center ${kindBg(file.category)}`}>
                <FileIcon category={file.category} typeLabel={file.typeLabel} />
              </div>
              {/* Meta */}
              <div className="p-3">
                <p className="text-xs font-medium text-surface-900 truncate leading-tight">{file.title}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-100 text-surface-500">
                    {file.typeLabel}
                  </span>
                  <span className="text-[10px] text-surface-400">{file.size}</span>
                </div>
                <p className="text-[10px] text-surface-400 mt-1">{file.date}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
