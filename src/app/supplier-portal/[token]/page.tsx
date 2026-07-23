import Link from "next/link";
import { BriefcaseBusiness, FileText, MessageSquare, ShieldCheck, WalletCards } from "lucide-react";

const PORTAL_AREAS = [
  { label: "Job & RFQ", description: "Brief, dates, requirements and response status.", icon: BriefcaseBusiness },
  { label: "Quote", description: "Pricing schedule, attachments and submission receipt.", icon: WalletCards },
  { label: "Evidence & documents", description: "Deliverables, insurance and compliance files.", icon: FileText },
  { label: "Messages", description: "Clarifications and event communication in one thread.", icon: MessageSquare },
  { label: "Payment status", description: "Approved milestones and payout information shared with you.", icon: ShieldCheck },
];

export default function SupplierPortalPage() {
  return (
    <main className="min-h-screen bg-surface-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl bg-gradient-to-r from-[#2c1b68] to-[#4f46e5] p-6 text-white shadow-lg sm:p-8">
          <p className="text-sm font-medium text-white/75">Gala Dock supplier portal</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Supplier collaboration workspace</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">This structural portal shell will give invited suppliers one secure, focused place to respond to RFQs, deliver work, upload evidence and review shared payment status.</p>
        </header>

        <nav aria-label="Supplier portal" className="mt-5 flex gap-2 overflow-x-auto rounded-xl border border-surface-200 bg-white p-2">
          {PORTAL_AREAS.map((area, index) => (
            <a key={area.label} href={index === 0 ? "#overview" : `#${area.label.toLowerCase().replaceAll(" ", "-")}`} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-surface-600 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">{area.label}</a>
          ))}
        </nav>

        <section id="overview" className="mt-5 rounded-xl border border-surface-200 bg-white p-5 sm:p-6">
          <h2 className="font-semibold text-surface-900">Access-controlled supplier area</h2>
          <p className="mt-1 text-sm leading-6 text-surface-600">When invitation, expiry and supplier scope are wired, this page will render only the event, RFQ and job records explicitly shared with this token. The shell deliberately has no workspace-switcher or internal navigation.</p>
        </section>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PORTAL_AREAS.map((area) => {
            const Icon = area.icon;
            return <section key={area.label} id={area.label.toLowerCase().replaceAll(" ", "-")} className="rounded-xl border border-surface-200 bg-white p-5"><Icon className="h-5 w-5 text-brand-700" /><h2 className="mt-3 font-semibold text-surface-900">{area.label}</h2><p className="mt-1 text-sm leading-6 text-surface-600">{area.description}</p><span className="mt-4 inline-flex rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600">Portal shell</span></section>;
          })}
        </div>

        <footer className="mt-6 text-center text-sm text-surface-500"><Link href="/help" className="font-medium text-brand-700 hover:text-brand-800">Need help?</Link> Contact the event team if your invitation has expired.</footer>
      </div>
    </main>
  );
}
