"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Check, Send, FileCheck2, Files, Trash2, RotateCcw } from "lucide-react";
import type { ProposalStatus } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";
import {
  sendProposal,
  duplicateProposal,
  deleteProposal,
  convertToInvoice,
  setProposalStatus,
} from "./actions";

interface Props {
  proposalId: string;
  status: ProposalStatus; // effective (expired computed)
  rawStatus: ProposalStatus; // stored status
  shareToken: string;
  convertedInvoiceId: string | null;
  createdAt: string;
  viewedAt: string | null;
  signedAt: string | null;
}

function isRedirect(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "digest" in e &&
    String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

export function ProposalActions({
  proposalId,
  status,
  rawStatus,
  shareToken,
  convertedInvoiceId,
  createdAt,
  viewedAt,
  signedAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl =
    typeof window !== "undefined" && shareToken
      ? `${window.location.origin}/p/${shareToken}`
      : "";

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        if (isRedirect(e)) throw e;
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isDraft = rawStatus === "draft";
  const isSigned = rawStatus === "signed";
  const isConverted = rawStatus === "converted";
  const canRevise = status === "declined" || status === "expired";

  return (
    <aside className="space-y-4">
      {/* Status / timeline card */}
      <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-card">
        <h3 className="text-sm font-semibold text-surface-900">Status</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Created" value={formatDate(createdAt)} />
          <Row label="Viewed" value={viewedAt ? formatDate(viewedAt) : "—"} />
          <Row label="Signed" value={signedAt ? formatDate(signedAt) : "—"} />
        </dl>
      </div>

      {/* Actions card */}
      <div className="space-y-2 rounded-xl border border-surface-200 bg-white p-5 shadow-card">
        <h3 className="mb-1 text-sm font-semibold text-surface-900">Actions</h3>

        {error && (
          <p className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
            {error}
          </p>
        )}

        {isDraft && (
          <button
            onClick={() => run(() => sendProposal(proposalId))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand-700"
          >
            <Send className="h-4 w-4" /> Send to client
          </button>
        )}

        {!isDraft && shareToken && (
          <button
            onClick={copyLink}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50"
          >
            {copied ? <Check className="h-4 w-4 text-success-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy client link"}
          </button>
        )}

        {isSigned && (
          <button
            onClick={() => run(() => convertToInvoice(proposalId))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-brand-700"
          >
            <FileCheck2 className="h-4 w-4" /> Convert to invoice
          </button>
        )}

        {isConverted && convertedInvoiceId && (
          <Link
            href={`/finance/invoices/${convertedInvoiceId}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            <FileCheck2 className="h-4 w-4" /> Converted → View invoice
          </Link>
        )}

        {canRevise && (
          <button
            onClick={() => run(() => setProposalStatus(proposalId, "draft"))}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50"
          >
            <RotateCcw className="h-4 w-4" /> Revise (reset to draft)
          </button>
        )}

        <button
          onClick={() => run(() => duplicateProposal(proposalId))}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-200 px-4 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50"
        >
          <Files className="h-4 w-4" /> Duplicate
        </button>

        {isDraft && (
          <button
            onClick={() => {
              if (confirm("Delete this proposal? This cannot be undone.")) {
                run(() => deleteProposal(proposalId));
              }
            }}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger-200 px-4 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-surface-500">{label}</dt>
      <dd className="font-medium text-surface-800">{value}</dd>
    </div>
  );
}
