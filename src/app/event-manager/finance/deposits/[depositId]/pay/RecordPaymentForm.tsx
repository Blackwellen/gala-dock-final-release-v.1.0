"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { recordDepositPayment, getDepositReceiptDownloadUrl } from "./actions";
import { formatCurrency } from "@/lib/utils";

const METHODS = ["bank_transfer", "card", "cash", "cheque", "other"];

export function RecordPaymentForm({
  depositId,
  balanceCents,
  currency,
}: {
  depositId: string;
  balanceCents: number;
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [downloadPending, setDownloadPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ paymentId: string; newStatus: string } | null>(null);
  const [amount, setAmount] = useState((balanceCents / 100).toFixed(2));
  const [method, setMethod] = useState(METHODS[0]);

  function submit() {
    setError(null);
    const amountMajor = Number(amount);
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await recordDepositPayment({ depositId, amountMajor, method });
        setResult({ paymentId: res.paymentId, newStatus: res.newStatus });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record payment");
      }
    });
  }

  async function handleDownload() {
    if (!result) return;
    setDownloadPending(true);
    try {
      const url = await getDepositReceiptDownloadUrl(result.paymentId);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setError("No receipt document is available (R2 storage isn't configured in this environment).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get download link");
    } finally {
      setDownloadPending(false);
    }
  }

  if (result) {
    return (
      <div className="bg-white rounded-xl border border-success-200 shadow-card p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold text-success-700">
            Payment recorded — deposit is now {result.newStatus === "paid" ? "fully paid" : "partially paid"}.
          </p>
          <p className="text-xs text-surface-500 mt-1">
            {formatCurrency(Number(amount), currency)} received via {method.replace("_", " ")}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-200 text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloadPending ? "Preparing…" : "Download Receipt"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/event-manager/finance/deposits")}
            className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
          >
            Back to Deposits
          </button>
        </div>
        {error && <p className="text-xs text-danger-600">{error}</p>}
      </div>
    );
  }

  return (
    <form action={submit} className="bg-white rounded-xl border border-surface-200 shadow-card p-6 space-y-4">
      {error && <div className="px-3 py-2 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm">{error}</div>}

      <label className="block">
        <span className="text-xs font-medium text-surface-600">Amount ({currency})</span>
        <input
          type="number"
          min="0"
          max={(balanceCents / 100).toFixed(2)}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-surface-600">Method</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
          {METHODS.map((m) => (
            <option key={m} value={m}>{m.replace("_", " ")}</option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded-lg border border-surface-200 text-sm font-medium text-surface-700 hover:bg-surface-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record Payment"}
        </button>
      </div>
    </form>
  );
}
