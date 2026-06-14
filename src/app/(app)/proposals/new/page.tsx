import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { ProposalWizard } from "./ProposalWizard";

export const metadata = { title: "New Proposal" };

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const { leadId } = await searchParams;
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, title, client_name, client_email, event_type, event_date, event_location, guest_count_estimate")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const leadOptions = (leads ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    clientName: l.client_name,
    clientEmail: l.client_email ?? "",
    eventType: l.event_type ?? "",
    eventDate: l.event_date ?? "",
    eventLocation: l.event_location ?? "",
    guestCount: l.guest_count_estimate != null ? String(l.guest_count_estimate) : "",
  }));

  return <ProposalWizard leads={leadOptions} initialLeadId={leadId ?? ""} />;
}
