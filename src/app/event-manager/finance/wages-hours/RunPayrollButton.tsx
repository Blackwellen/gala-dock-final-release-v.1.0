"use client";

import { useState, useTransition } from "react";
import { Wallet, Download } from "lucide-react";
import { runPayroll, getPayrollExportDownloadUrl } from "./actions";
import { formatCentsCompact } from "../_lib/finance";

/**
 * Embedded CTA for the "Payroll Due" insight card. This does NOT submit
 * payroll to any provider (none is connected in this codebase) — it creates a
 * local, auditable `payroll_exports` snapshot from approved timesheets. The
 * result copy is deliberately explicit that no money has actually moved.
 */
export function RunPayrollButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ exportId: string; timesheetCount: number; totalCents: number } | null>(null);
  const [downloadPending, setDownloadPending] = useState(false);

  function handleRunPayroll() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await runPayroll();
        setResult({ exportId: res.exportId, timesheetCount: res.timesheetCount, totalCents: res.totalCents });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to prepare payroll export");
      }
    });
  }

  async function handleDownload() {
    if (!result) return;
    setDownloadPending(true);
    try {
      const url = await getPayrollExportDownloadUrl(result.exportId);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setError("No document is available for this export (R2 storage isn't configured in this environment).");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get download link");
    } finally {
      setDownloadPending(false);
    }
  }

  if (result) {
    return (
      <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
        <p className="font-semibold">Exported — no payroll provider connected</p>
        <p className="mt-1 text-brand-700">
          {result.timesheetCount} timesheet{result.timesheetCount === 1 ? "" : "s"} · {formatCentsCompact(result.totalCents)}{" "}
          saved as a local export record. Submit this to your payroll provider manually.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloadPending}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {downloadPending ? "Preparing…" : "Download CSV"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleRunPayroll}
        disabled={pending || disabled}
        title={disabled ? "No approved timesheets are ready for export" : undefined}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Wallet className="w-3.5 h-3.5" />
        {pending ? "Preparing export…" : "Run Payroll"}
      </button>
      {error && <p className="mt-2 text-xs text-danger-600">{error}</p>}
      {!error && (
        <p className="mt-2 text-[11px] text-surface-400">
          Creates a local export record only — no payroll provider is connected, no payment is sent.
        </p>
      )}
    </div>
  );
}
