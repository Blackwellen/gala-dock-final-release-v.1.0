import { ActionForm } from "@/components/workspace/actions";
import { saveBillingDetailsAction } from "@/lib/actions/billing";
import { BUSINESS_ONLY_COPY, type BillingDetails } from "@/lib/billing/core";
import type { Db } from "@/lib/workspace/db";
import { untyped } from "@/lib/workspace/db";

/**
 * Q74 (owner decision D15): plans and credit packs are business-only for launch. The business name (required) and VAT number
 * (optional) are saved before checkout, put on the Stripe billing customer and printed on Gala Dock's VAT invoices.
 */
export async function BillingBusinessDetails({ db, workspaceId, kind, canEdit }: { db: Db; workspaceId: string; kind: "organizer" | "provider"; canEdit: boolean }) {
  const { data } = await untyped(db as never).from("workspace_billing_details").select("business_name,vat_number,country").eq("workspace_id", workspaceId).maybeSingle();
  const d = data as BillingDetails | null;
  return <div className="k-card" style={{ padding: 14, margin: "12px 0" }} id="billing-details">
    <b>Billing details</b>
    <p className="k-small k-muted">{BUSINESS_ONLY_COPY.explainer}</p>
    {d && !canEdit && <p className="k-small">{d.business_name}{d.vat_number ? ` · VAT ${d.vat_number}` : ""}</p>}
    {!d && !canEdit && <p className="k-small">The owner or a finance member adds the business details before buying a plan or credits.</p>}
    {canEdit && <ActionForm action={saveBillingDetailsAction.bind(null, workspaceId, kind)} className="k-row" >
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <label className="k-small">Business name (as on your invoices)<input name="business_name" required minLength={2} maxLength={200} defaultValue={d?.business_name ?? ""} autoComplete="organization" className="k-input" /></label>
        <label className="k-small">VAT number (optional)<input name="vat_number" maxLength={20} defaultValue={d?.vat_number ?? ""} placeholder="GB123456789" pattern="[A-Za-z]{2}[A-Za-z0-9 .\-]{2,16}" className="k-input" /></label>
        <label className="k-small">Business country (ISO code, optional)<input name="country" maxLength={2} defaultValue={d?.country ?? ""} placeholder="GB" pattern="[A-Za-z]{2}" className="k-input" /></label>
        <label className="k-small"><input type="checkbox" name="confirm_business" required defaultChecked={!!d} /> I’m buying for a business, not as a consumer.</label>
        <div><button type="submit" className="k-btn primary sm">{d ? "Update billing details" : "Save billing details"}</button></div>
      </div>
    </ActionForm>}
  </div>;
}
