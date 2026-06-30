import type { Proposal, ProposalLineItem } from "@/lib/supabase/types";
import { formatPence } from "../_lib/proposals";
import { formatDate } from "@/lib/utils";

interface ProposalDocumentProps {
  proposal: Proposal;
  lineItems: ProposalLineItem[];
  workspaceName: string;
}

/**
 * The rendered proposal document — shared by the internal detail view and the
 * public signing page so the client sees exactly what the planner sees.
 */
export function ProposalDocument({ proposal, lineItems, workspaceName }: ProposalDocumentProps) {
  const currency = proposal.currency || "GBP";
  const subtotal = lineItems.reduce((sum, li) => sum + (li.total_cents ?? 0), 0);
  const total = proposal.total_cents || subtotal;
  const depositPct = proposal.deposit_pct ?? 0;
  const depositAmount = Math.round((total * depositPct) / 100);

  return (
    <article className="bg-white text-surface-900">
      {/* Branding header */}
      <header className="flex items-start justify-between gap-4 border-b border-surface-200 pb-6">
        <div>
          <p className="text-lg font-bold tracking-tight text-brand-700">Gala Dock</p>
          <p className="text-sm text-surface-500">{workspaceName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-surface-400">Proposal</p>
          {proposal.valid_until && (
            <p className="mt-1 text-xs text-surface-500">
              Valid until {formatDate(proposal.valid_until)}
            </p>
          )}
        </div>
      </header>

      {/* Title + client/event details */}
      <div className="mt-6">
        <h1 className="text-2xl font-bold tracking-tight text-surface-900">{proposal.title}</h1>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Detail label="Prepared for" value={proposal.client_name} />
          {proposal.client_email && <Detail label="Email" value={proposal.client_email} />}
          {proposal.event_type && <Detail label="Event type" value={proposal.event_type} />}
          {proposal.event_date && <Detail label="Event date" value={formatDate(proposal.event_date)} />}
          {proposal.event_location && <Detail label="Location" value={proposal.event_location} />}
          {proposal.guest_count != null && (
            <Detail label="Guests" value={String(proposal.guest_count)} />
          )}
        </dl>
      </div>

      {/* Introduction */}
      {proposal.intro_text && (
        <section className="mt-8">
          <p className="whitespace-pre-line text-sm leading-relaxed text-surface-700">
            {proposal.intro_text}
          </p>
        </section>
      )}

      {/* Line items */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-500">
          Services &amp; Pricing
        </h2>
        <div className="overflow-hidden rounded-lg border border-surface-200">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
              <tr>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Unit price</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-surface-400">
                    No line items
                  </td>
                </tr>
              ) : (
                lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="px-4 py-3 text-surface-800">{li.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-surface-600">{li.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-surface-600">
                      {formatPence(li.unit_price_cents, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-surface-900">
                      {formatPence(li.total_cents ?? 0, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t border-surface-200 bg-surface-50">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-medium text-surface-600">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right text-base font-bold tabular-nums text-surface-900">
                  {formatPence(total, currency)}
                </td>
              </tr>
              {depositPct > 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-xs text-surface-500">
                    Deposit to confirm ({depositPct}%)
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-brand-700">
                    {formatPence(depositAmount, currency)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </section>

      {/* Terms */}
      {proposal.terms_text && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-surface-500">
            Terms &amp; Conditions
          </h2>
          <p className="whitespace-pre-line text-xs leading-relaxed text-surface-600">
            {proposal.terms_text}
          </p>
        </section>
      )}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-surface-400">{label}</dt>
      <dd className="mt-0.5 text-surface-800">{value}</dd>
    </div>
  );
}
