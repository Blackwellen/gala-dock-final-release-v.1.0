import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { RecordPaymentForm } from "./RecordPaymentForm";

export const metadata = { title: "Finance — Record Deposit Payment" };
export const dynamic = "force-dynamic";

export default async function RecordDepositPaymentPage({
  params,
}: {
  params: Promise<{ depositId: string }>;
}) {
  const { depositId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: deposit } = await supabase
    .from("event_deposits")
    .select("id, event_id, label, amount_cents, paid_cents, currency")
    .eq("id", depositId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!deposit) notFound();

  const { data: event } = await supabase.from("events").select("name").eq("id", deposit.event_id).maybeSingle();
  const balanceCents = deposit.amount_cents - deposit.paid_cents;

  return (
    <div className="min-h-full bg-surface-50">
      <PageHeader
        title="Record Payment"
        description={`${deposit.label} — ${event?.name ?? "Unknown event"}`}
      />
      <div className="p-6 max-w-lg">
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6 mb-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-surface-400 uppercase tracking-wider">Total Required</dt>
              <dd className="font-semibold text-surface-900">{formatCurrency(deposit.amount_cents / 100, deposit.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-surface-400 uppercase tracking-wider">Paid So Far</dt>
              <dd className="font-semibold text-surface-900">{formatCurrency(deposit.paid_cents / 100, deposit.currency)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-surface-400 uppercase tracking-wider">Balance</dt>
              <dd className="font-semibold text-brand-600">{formatCurrency(balanceCents / 100, deposit.currency)}</dd>
            </div>
          </dl>
        </div>

        <RecordPaymentForm depositId={deposit.id} balanceCents={balanceCents} currency={deposit.currency} />
      </div>
    </div>
  );
}
