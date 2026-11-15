"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";
import { TAX_DETAILS_DB_ERRORS, validateTaxDetails, type TaxDetailsErrors, type TaxDetailsInput } from "@/lib/tax/platform-reporting";
import { sanctionsErrorMessage } from "@/lib/legal/sanctions";
import { checkPostcode, countryProfile } from "@/lib/i18n/countries";

type R = { ok: true; message: string } | { ok: false; error: string; errors?: TaxDetailsErrors };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Q74 (D7, PORR 2023): save the seller's platform-reporting details. Owner or finance; the database validates again and audits. */
export async function saveTaxDetails(workspaceId: string, raw: Partial<TaxDetailsInput>): Promise<R> {
  if (!UUID.test(workspaceId)) return { ok: false, error: "Workspace not found." };
  const input: Partial<TaxDetailsInput> = {
    seller_type: raw.seller_type === "entity" ? "entity" : raw.seller_type === "individual" ? "individual" : undefined,
    legal_name: str(raw.legal_name), date_of_birth: str(raw.date_of_birth, 10), tin: str(raw.tin, 30), tin_country: str(raw.tin_country, 2).toUpperCase(),
    tin_not_issued: raw.tin_not_issued === true, vat_number: str(raw.vat_number, 20), company_number: str(raw.company_number, 20),
    address_line1: str(raw.address_line1), address_line2: str(raw.address_line2), city: str(raw.city, 100), region: str(raw.region, 100),
    postal_code: str(raw.postal_code, 20), country: str(raw.country, 2).toUpperCase(), confirmed_accurate: raw.confirmed_accurate === true,
  };
  const errors = validateTaxDetails(input);
  // Q76 (L05): the postcode follows the address country's format (countries without postcodes accept blank).
  if (input.country && !errors.postal_code) { const pc = checkPostcode(input.postal_code, input.country); if (pc.ok) input.postal_code = pc.value; else if (input.postal_code || countryProfile(input.country)?.postcode) errors.postal_code = pc.error; }
  if (Object.keys(errors).length) return { ok: false, error: "Check the highlighted fields.", errors };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  if (!(await rateLimit(`tax-details:${user.id}`, 20, 600))) return { ok: false, error: "Too many attempts — try again in a few minutes." };
  const { error } = await sb.rpc("seller_tax_profile_save" as never, { p_workspace: workspaceId, p: input } as never);
  if (error) return { ok: false, error: sanctionsErrorMessage(error) ?? TAX_DETAILS_DB_ERRORS.find(([re]) => re.test(error.message))?.[1] ?? "Couldn’t save your tax details — try again." };
  revalidatePath("/provider/money", "layout");
  return { ok: true, message: "Tax details saved. Thank you — this is what HMRC asks us to hold." };
}
