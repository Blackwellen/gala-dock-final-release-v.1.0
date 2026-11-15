import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "@/styles/provider-money.css";
import { getProvider } from "@/lib/provider/context";
import { TaxDetailsForm } from "@/components/payments/tax-details-form";
import { FinanceOnly } from "../_components/finance-only";
import { DUE_DILIGENCE } from "@/lib/tax/platform-reporting";

export const metadata: Metadata = { title: "Tax details" };

type Status = { required: boolean; complete: boolean; seller_type: string | null; legal_name: string | null; tin_masked: string | null; tin_country: string | null;
  tin_not_issued: boolean | null; date_of_birth_set: boolean; vat_number: string | null; company_number: string | null; city: string | null; country: string | null;
  updated_at: string | null; requests: { step: number; sent_at: string }[]; hold: boolean };

/** Q74 (D7): Money → Tax details — UK platform reporting (Platform Operators Regulations 2023). Owner and finance only. */
export default async function TaxDetailsPage() {
  const ctx = await getProvider();
  if (!["owner", "finance"].includes(ctx.role)) return <FinanceOnly />;
  const { data } = await ctx.db.rpc("seller_tax_profile_status" as never, { p_workspace: ctx.workspace.id } as never);
  const s = data as Status | null;
  const date = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  return <div className="pm">
    <div className="pm-st-bar"><Link href="/provider/money" className="ws-back"><ArrowLeft aria-hidden="true" />Back to Money</Link></div>
    <header className="ws-page-head pm-head"><div><h1>Tax details</h1><p>What UK law asks us to collect so we can report your earnings to HMRC once a year.</p></div></header>
    {s?.hold && <p className="ws-form-error" role="alert">Your payouts are on hold until you add these details. Saving them releases the hold straight away; your money stays in your own Stripe balance.</p>}
    {s?.complete
      ? <section className="ws-panel"><p><b>Details on file</b> · updated {date(s.updated_at)}</p>
          <ul className="k-small"><li>{s.seller_type === "individual" ? "Individual" : "Company or organisation"}: {s.legal_name}</li>
            <li>Tax reference: {s.tin_not_issued ? "not issued in this country" : `${s.tin_masked} (${s.tin_country})`}</li>
            {s.seller_type === "individual" ? <li>Date of birth: on file</li> : <li>Company number: {s.company_number}</li>}
            {s.vat_number && <li>VAT number: {s.vat_number}</li>}<li>Address: {s.city}, {s.country}</li></ul>
          <details><summary className="k-small">Update these details</summary><TaxDetailsForm workspaceId={ctx.workspace.id} defaultCountry={s.country ?? "GB"} /></details></section>
      : <section className="ws-panel">
          {s?.requests?.length ? <p className="k-small">We asked for these on {date(s.requests[0]?.sent_at)}{s.requests.length > 1 ? ` and sent ${s.requests.length - 1} reminder${s.requests.length > 2 ? "s" : ""}` : ""}. If they’re still missing {DUE_DILIGENCE.holdDay} days after the first request, we must hold your payouts.</p> : null}
          <TaxDetailsForm workspaceId={ctx.workspace.id} /></section>}
    <p className="k-small k-muted">Why we ask, and what we report: <Link href="/help/tax-details-for-hmrc">Tax details for HMRC reporting</Link>. Only the last three characters of your tax reference are shown again.</p>
  </div>;
}
