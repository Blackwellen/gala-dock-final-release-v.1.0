import { r2Configured, r2Key, r2PutObject } from "@/lib/storage/r2";
import { formatCents } from "./finance";

/**
 * Server-generated Finance documents (payroll export CSVs, supplier
 * remittance advice, deposit receipts). There is no PDF-rendering library in
 * this repo (no jspdf/puppeteer/pdfkit) — rather than add a new dependency
 * for this pass, these generate plain, genuinely-openable CSV/HTML documents
 * and upload them to R2 via the existing `r2PutObject` helper. All callers
 * must treat a missing R2 configuration as a soft failure (the underlying
 * database action has already succeeded and should not be rolled back just
 * because the optional document couldn't be generated) — see `safeGenerateAndUpload`.
 */

/** Upload a generated document, returning null (never throwing) if R2 isn't configured
 *  or the upload fails — the caller's database action must not be blocked by this. */
export async function safeGenerateAndUpload(opts: {
  workspaceId: string;
  kind: string;
  recordId: string;
  filename: string;
  contentType: string;
  body: string;
}): Promise<string | null> {
  if (!r2Configured()) return null;
  try {
    const key = r2Key({ workspaceId: opts.workspaceId, kind: opts.kind, recordId: opts.recordId, filename: opts.filename });
    await r2PutObject({ key, body: opts.body, contentType: opts.contentType });
    return key;
  } catch (err) {
    console.error(`[finance/documents] failed to generate/upload ${opts.kind} for ${opts.recordId}:`, err);
    return null;
  }
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface PayrollExportRow {
  timesheetId: string;
  teamMemberName: string;
  role: string | null;
  eventName: string;
  regularHours: number;
  overtimeHours: number;
  hourlyRateCents: number;
  overtimeRateCents: number;
  costCents: number;
}

/** CSV payroll export — the kind of file a bookkeeper can import directly into a payroll system. */
export function generatePayrollExportCsv(opts: {
  exportId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  currency: string;
  rows: PayrollExportRow[];
}): string {
  const header = [
    "Timesheet ID", "Team Member", "Role", "Event", "Regular Hours", "Overtime Hours",
    "Hourly Rate", "Overtime Rate", "Cost",
  ];
  const lines = [header.map(escapeCsv).join(",")];
  for (const r of opts.rows) {
    lines.push(
      [
        r.timesheetId,
        r.teamMemberName,
        r.role ?? "",
        r.eventName,
        r.regularHours.toFixed(2),
        r.overtimeHours.toFixed(2),
        formatCents(r.hourlyRateCents, opts.currency),
        formatCents(r.overtimeRateCents, opts.currency),
        formatCents(r.costCents, opts.currency),
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  const total = opts.rows.reduce((s, r) => s + r.costCents, 0);
  lines.push("");
  lines.push(`Payroll Export,${opts.exportId}`);
  lines.push(`Pay Period,${opts.payPeriodStart} to ${opts.payPeriodEnd}`);
  lines.push(`Total,${escapeCsv(formatCents(total, opts.currency))}`);
  lines.push("No payroll provider is connected — this export is a snapshot for manual submission only.");
  return lines.join("\n");
}

function documentShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #232840; max-width: 720px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #6b7490; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e4e7ef; }
  th { color: #6b7490; text-transform: uppercase; font-size: 11px; letter-spacing: 0.03em; }
  .total-row td { font-weight: 700; border-top: 2px solid #232840; }
  .footer-note { margin-top: 24px; font-size: 12px; color: #6b7490; }
</style></head>
<body>${bodyHtml}</body></html>`;
}

/** Supplier payment batch remittance advice — one document per Batch Pay run. */
export function generateRemittanceHtml(opts: {
  batchReference: string;
  paidAt: string;
  currency: string;
  lines: { billNumber: string; supplierName: string; description: string; amountCents: number }[];
}): string {
  const total = opts.lines.reduce((s, l) => s + l.amountCents, 0);
  const rows = opts.lines
    .map(
      (l) =>
        `<tr><td>${l.billNumber}</td><td>${l.supplierName}</td><td>${l.description}</td><td>${formatCents(l.amountCents, opts.currency)}</td></tr>`
    )
    .join("");
  const body = `
    <h1>Remittance Advice</h1>
    <p class="meta">Batch ${opts.batchReference} &middot; ${opts.paidAt}</p>
    <table>
      <thead><tr><th>Bill</th><th>Supplier</th><th>Description</th><th>Amount</th></tr></thead>
      <tbody>${rows}
        <tr class="total-row"><td colspan="3">Total</td><td>${formatCents(total, opts.currency)}</td></tr>
      </tbody>
    </table>
    <p class="footer-note">Generated automatically by Gala Dock when this payment batch was created. This confirms the batch was initiated, not that funds have settled with each supplier — check your bank/payment provider for final settlement confirmation.</p>`;
  return documentShell(`Remittance Advice — ${opts.batchReference}`, body);
}

/** Deposit payment receipt — issued when a deposit payment is recorded. */
export function generateDepositReceiptHtml(opts: {
  depositLabel: string;
  eventName: string;
  amountCents: number;
  currency: string;
  method: string | null;
  paidAt: string;
  balanceRemainingCents: number;
}): string {
  const body = `
    <h1>Deposit Payment Receipt</h1>
    <p class="meta">${opts.eventName} &middot; ${opts.paidAt}</p>
    <table>
      <thead><tr><th>Deposit</th><th>Method</th><th>Amount Received</th><th>Balance Remaining</th></tr></thead>
      <tbody>
        <tr>
          <td>${opts.depositLabel}</td>
          <td>${opts.method ?? "—"}</td>
          <td>${formatCents(opts.amountCents, opts.currency)}</td>
          <td>${formatCents(opts.balanceRemainingCents, opts.currency)}</td>
        </tr>
      </tbody>
    </table>
    <p class="footer-note">Generated automatically by Gala Dock when this payment was recorded.</p>`;
  return documentShell(`Deposit Receipt — ${opts.depositLabel}`, body);
}
