import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { can } from "@/lib/domain/permissions";
import { loadProSetup } from "@/lib/data/ticket-pro";
import { ProShell } from "@/components/organizer/ticket-pro/ui";
import { StepModel } from "@/components/organizer/ticket-pro/step-model";
import { StepTiers } from "@/components/organizer/ticket-pro/step-tiers";
import { StepSeating } from "@/components/organizer/ticket-pro/step-seating";
import { StepAccess } from "@/components/organizer/ticket-pro/step-access";
import { StepReview } from "@/components/organizer/ticket-pro/step-review";

export const metadata = { title: "Ticket setup" };

/** W03 · Professional ticket setup: model & capacity → tiers, releases & pricing → seating & allocation → access & controls → review & activate. */
export default async function OrganizerTicketSetup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer();
  const data = await loadProSetup(ctx.supabase, id, ctx.workspace.id); if (!data) notFound();
  const step = Math.min(5, Math.max(1, Number(sp.step) || 1));
  const base = `/organizer/events/${id}/tickets/setup`;
  if (!can("organizer", ctx.role, "tickets.manage")) return <ProShell step={step} base={base} event={data.event}><p className="k-notice">Only workspace owners and managers can change ticket setup. Ask an owner for access.</p></ProShell>;
  // Keyed per step so each step starts from freshly saved server data.
  return <ProShell step={step} base={base} event={data.event}>
    {step === 1 && <StepModel key="1" data={data} base={base} />}
    {step === 2 && <StepTiers key="2" data={data} base={base} />}
    {step === 3 && <StepSeating key="3" data={data} base={base} />}
    {step === 4 && <StepAccess key="4" data={data} base={base} />}
    {step === 5 && <StepReview key="5" data={data} base={base} />}
  </ProShell>;
}
