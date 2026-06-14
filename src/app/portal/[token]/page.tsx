import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePortalToken, recordPortalView } from "./resolve";
import { PortalClient, type PortalData } from "./PortalClient";
import { Link2Off } from "lucide-react";

export const dynamic = "force-dynamic";

function InvalidPortal() {
  return (
    <main className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card max-w-md w-full p-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
          <Link2Off className="w-6 h-6 text-surface-400" strokeWidth={1.5} />
        </div>
        <h1 className="text-lg font-semibold text-surface-900">Portal link invalid or expired</h1>
        <p className="mt-2 text-sm text-surface-500">
          This portal link is no longer active. Please contact your event manager for an
          up-to-date link.
        </p>
        <p className="mt-8 text-xs text-surface-400">Powered by Gala Dock</p>
      </div>
    </main>
  );
}

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const resolved = await resolvePortalToken(token);
  if (!resolved || !resolved.eventId) return <InvalidPortal />;

  const admin = createAdminClient();

  // Scope every query to the resolved workspace + event so a token can never
  // reach another workspace's data.
  const { data: event } = await admin
    .from("events")
    .select(
      "id, name, status, event_type, start_at, end_at, location, guest_count_day, guest_count_evening, client_name, workspace_id, deleted_at"
    )
    .eq("id", resolved.eventId)
    .eq("workspace_id", resolved.workspaceId)
    .maybeSingle();

  if (!event || event.deleted_at) return <InvalidPortal />;

  await recordPortalView(resolved.linkId);

  const { data: workspace } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", resolved.workspaceId)
    .maybeSingle();

  // Client-visible documents: files tagged "client" on this event.
  const { data: files } = await admin
    .from("event_files")
    .select("id, filename, mime_type, size_bytes, created_at, tags")
    .eq("event_id", event.id)
    .eq("workspace_id", resolved.workspaceId)
    .order("created_at", { ascending: false });

  const clientFiles = (files ?? []).filter((f) =>
    Array.isArray(f.tags) ? f.tags.map((t) => t.toLowerCase()).includes("client") : false
  );

  // Most recent invoice for the event.
  const { data: invoice } = await admin
    .from("invoices")
    .select(
      "id, invoice_number, status, total_cents, paid_cents, currency, due_on, stripe_payment_link_url"
    )
    .eq("event_id", event.id)
    .eq("workspace_id", resolved.workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let scheduleRows: { label: string; amountCents: number; dueDate: string; status: string }[] = [];
  if (invoice) {
    const { data: sched } = await admin
      .from("invoice_payment_schedules")
      .select("label, amount_cents, due_date, status, sort_order")
      .eq("invoice_id", invoice.id)
      .eq("workspace_id", resolved.workspaceId)
      .order("sort_order", { ascending: true });
    scheduleRows = (sched ?? []).map((s) => ({
      label: s.label,
      amountCents: s.amount_cents,
      dueDate: s.due_date,
      status: s.status,
    }));
  }

  // Most recent proposal for the event.
  const { data: proposal } = await admin
    .from("proposals")
    .select("id, title, status, total_cents, currency, share_token, signed_by_name, signed_at")
    .eq("event_id", event.id)
    .eq("workspace_id", resolved.workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const data: PortalData = {
    workspaceName: workspace?.name ?? "Gala Dock",
    event: {
      name: event.name,
      status: event.status,
      eventType: event.event_type,
      startAt: event.start_at,
      endAt: event.end_at,
      location: event.location,
      guestCountDay: event.guest_count_day,
      guestCountEvening: event.guest_count_evening,
      clientName: event.client_name,
    },
    documents: clientFiles.map((f) => ({
      id: f.id,
      filename: f.filename,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      createdAt: f.created_at,
    })),
    invoice: invoice
      ? {
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          totalCents: invoice.total_cents,
          paidCents: invoice.paid_cents,
          currency: invoice.currency,
          dueOn: invoice.due_on,
          paymentLinkUrl: invoice.stripe_payment_link_url,
          schedule: scheduleRows,
        }
      : null,
    proposal: proposal
      ? {
          title: proposal.title,
          status: proposal.status,
          totalCents: proposal.total_cents,
          currency: proposal.currency,
          shareToken: proposal.share_token,
          signedByName: proposal.signed_by_name,
          signedAt: proposal.signed_at,
        }
      : null,
  };

  return <PortalClient data={data} />;
}
