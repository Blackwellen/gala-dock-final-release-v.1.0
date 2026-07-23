"use client";

import { useState, useTransition } from "react";
import { FileText, Download } from "lucide-react";
import { getJobEvidenceDownloadUrl } from "./actions";

export interface EvidenceRow {
  id: string;
  taskId: string;
  taskTitle: string;
  filename: string;
  mime: string;
  sizeLabel: string;
  uploadedByName: string;
  createdAtLabel: string;
}

export function EvidenceList({ rows }: { rows: EvidenceRow[] }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white divide-y divide-surface-100">
      {rows.map((r) => (
        <EvidenceRowItem key={r.id} row={r} />
      ))}
    </div>
  );
}

function EvidenceRowItem({ row }: { row: EvidenceRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const res = await getJobEvidenceDownloadUrl(row.id);
      if ("url" in res) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-50">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
        <div className="min-w-0">
          <p className="text-sm text-surface-800 truncate">{row.filename}</p>
          <p className="text-xs text-surface-400 truncate">
            {row.taskTitle} · {row.sizeLabel} · {row.uploadedByName} · {row.createdAtLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {error && <span className="text-xs text-danger-600">{error}</span>}
        <button
          type="button"
          onClick={handleDownload}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-100 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
          {isPending ? "Opening…" : "Download"}
        </button>
      </div>
    </div>
  );
}
