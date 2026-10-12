import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
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

/** W03 has three canonical stages. Seating and final review remain explicit nested states. */
export default async function OrganizerTicketSetup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]); if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer();
  const data = await loadProSetup(ctx.supabase, id, ctx.workspace.id); if (!data) notFound();
  const base = `/organizer/events/${id}/tickets/setup`;
  if (sp.step === "4") redirect(`${base}?step=3&section=policies`);
  if (sp.step === "5") redirect(`${base}?step=3&section=review`);
  const step = Math.min(3, Math.max(1, Number(sp.step) || 1));
  const section = step === 1 && sp.section === "seating" ? "seating" : step === 3 && sp.section === "review" ? "review" : step === 3 ? "policies" : "model";
  if (!can("organizer", ctx.role, "tickets.manage")) return <ProShell step={step} base={base} event={data.event}><p className="k-notice">Only workspace owners and managers can change ticket setup. Ask an owner for access.</p></ProShell>;
  // Keyed per step so each step starts from freshly saved server data.
  return <ProShell step={step} base={base} event={data.event}>
    {(step === 1 || step === 3) && <nav className="tp-stage-tabs" aria-label={step === 1 ? "Model and capacity sections" : "Rules and publish sections"}>{(step === 1 ? [["model", "Model & Capacity"], ["seating", "Seating & Allocation"]] : [["policies", "Rules & Policies"], ["review", "Review & Publish"]]).map(([key,label])=><Link key={key} href={`${base}?step=${step}&section=${key}`} aria-current={section === key ? "page" : undefined}>{label}</Link>)}</nav>}
    {step === 1 && section !== "seating" && <StepModel key="1" data={data} base={base} />}
    {step === 1 && section === "seating" && <StepSeating key="seating" data={data} base={base} nextHref={`${base}?step=2`} backHref={`${base}?step=1`} />}
    {step === 2 && <StepTiers key="2" data={data} base={base} />}
    {step === 3 && section === "policies" && <StepAccess key="policies" data={data} base={base} nextHref={`${base}?step=3&section=review`} backHref={`${base}?step=2`} />}
    {step === 3 && section === "review" && <StepReview key="review" data={data} base={base} />}
  </ProShell>;
}
