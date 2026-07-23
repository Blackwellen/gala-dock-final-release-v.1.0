"use client";

import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { formatFileSize } from "@/lib/messaging/format";
import { getAttachmentDownloadUrl } from "@/lib/messaging/attachments-client";

export function AttachmentChip({
  workspaceId,
  fileName,
  mimeType,
  sizeBytes,
  r2Key,
}: {
  workspaceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const ext = fileName.split(".").pop()?.toUpperCase() ?? mimeType.split("/")[1]?.toUpperCase() ?? "FILE";

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = await getAttachmentDownloadUrl(workspaceId, r2Key);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Non-fatal: the file remains listed, user can retry.
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-surface-200 bg-white px-3 py-2 max-w-xs">
      <div className="w-9 h-9 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-surface-800 truncate">{fileName}</p>
        <p className="text-xs text-surface-400">
          {formatFileSize(sizeBytes)} · {ext}
        </p>
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Download ${fileName}`}
        className="w-8 h-8 rounded-md border border-surface-200 flex items-center justify-center text-surface-500 hover:bg-surface-50 shrink-0 disabled:opacity-50"
      >
        {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
