/**
 * UK platform reporting (owner decision D7): the Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023
 * (SI 2023/817 — verify the citation), the UK implementation of the OECD Model Rules (DAC7-equivalent).
 * Pure module: validation mirrored by public.seller_tax_profile_save (migration 202611147401), the due-diligence timetable used by
 * public.platform_reporting_due_diligence, and the annual export (CSV + XML-ready) built from admin_platform_reporting_report rows.
 * AI-drafted engineering, not tax advice: every (verify) waits for the tax adviser (docs/legal/review-2026-11/tax-and-reporting.md §5).
 */

/** Initial request, then two reminders; payouts held only after both reminders AND 60 days from the initial request (verify). */
export const DUE_DILIGENCE = { reminder1Day: 20, reminder2Day: 40, holdDay: 60 } as const;

export type DueDiligenceState = { step0?: string | null; step1?: string | null; step2?: string | null; complete: boolean; held: boolean };
export type DueDiligenceAction = "none" | "initial" | "reminder_1" | "reminder_2" | "hold";

/** Next due-diligence action at `now` (same rule as the SQL sweep). */
export function nextDueDiligenceAction(s: DueDiligenceState, now: Date): DueDiligenceAction {
  if (s.complete || s.held) return "none";
  if (!s.step0) return "initial";
  const days = (now.getTime() - Date.parse(s.step0)) / 86_400_000;
  if (!s.step1) return days >= DUE_DILIGENCE.reminder1Day ? "reminder_1" : "none";
  if (!s.step2) return days >= DUE_DILIGENCE.reminder2Day ? "reminder_2" : "none";
  return days >= DUE_DILIGENCE.holdDay ? "hold" : "none";
}

export type TaxDetailsInput = {
  seller_type: "individual" | "entity"; legal_name: string; date_of_birth?: string; tin?: string; tin_country?: string; tin_not_issued?: boolean;
  vat_number?: string; company_number?: string; address_line1: string; address_line2?: string; city: string; region?: string; postal_code?: string;
  country: string; confirmed_accurate: boolean;
};
export type TaxDetailsErrors = Partial<Record<keyof TaxDetailsInput, string>>;

const compact = (v: unknown, re = /[\s-]/g) => (typeof v === "string" ? v.replace(re, "").toUpperCase() : "");
/** UK UTR (10 digits) or National Insurance number. */
export const UK_TIN = /^([0-9]{10}|[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z][0-9]{6}[A-D])$/;
export const VAT_NUMBER = /^[A-Z]{2}[A-Z0-9]{2,13}$/;
export const GB_VAT = /^GB([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$/;
export const UK_COMPANY = /^([0-9]{8}|[A-Z]{2}[0-9]{6})$/;

export const normaliseVat = (v: unknown) => compact(v, /[\s.-]/g);
export function vatNumberValid(v: unknown): boolean {
  const n = normaliseVat(v);
  return !n || (VAT_NUMBER.test(n) && (!n.startsWith("GB") || GB_VAT.test(n)));
}

/** Client + server pre-check; the database is authoritative and applies the same rules. */
export function validateTaxDetails(v: Partial<TaxDetailsInput>, today = new Date()): TaxDetailsErrors {
  const e: TaxDetailsErrors = {};
  const country = compact(v.country);
  if (v.seller_type !== "individual" && v.seller_type !== "entity") e.seller_type = "Choose individual or company.";
  if (!v.legal_name || v.legal_name.trim().length < 2) e.legal_name = "Enter your full legal name (or the company’s registered name).";
  if (!/^[A-Z]{2}$/.test(country)) e.country = "Choose the country of your address.";
  if (!v.address_line1 || v.address_line1.trim().length < 2) e.address_line1 = "Enter the first line of your address.";
  if (!v.city || !v.city.trim()) e.city = "Enter the town or city.";
  const tin = compact(v.tin), tinCountry = compact(v.tin_country) || country;
  if (!tin && !v.tin_not_issued) e.tin = "Enter your tax reference, or tick that your country doesn’t issue one.";
  else if (tin && (!/^[A-Z0-9]{4,20}$/.test(tin) || (tinCountry === "GB" && !UK_TIN.test(tin)))) e.tin = tinCountry === "GB" ? "Enter a 10-digit UTR or a National Insurance number (e.g. AB123456C)." : "Enter the tax number as issued (letters and digits).";
  if (!vatNumberValid(v.vat_number)) e.vat_number = "Enter the VAT number with its country prefix, e.g. GB123456789.";
  const co = compact(v.company_number, /\s/g);
  if (co && (!/^[A-Z0-9]{2,20}$/.test(co) || (country === "GB" && !UK_COMPANY.test(co)))) e.company_number = "Enter the company number as registered (UK: 8 characters, e.g. 01234567 or SC123456).";
  if (v.seller_type === "entity" && !co && !tin) e.company_number = "Enter the company number (or the company’s tax number).";
  if (v.seller_type === "individual") {
    const d = v.date_of_birth ? new Date(`${v.date_of_birth}T00:00:00Z`) : null;
    const min = new Date(today); min.setUTCFullYear(min.getUTCFullYear() - 120);
    const max = new Date(today); max.setUTCFullYear(max.getUTCFullYear() - 18);
    if (!d || Number.isNaN(d.getTime()) || d > max || d < min) e.date_of_birth = "Enter your date of birth (you must be 18 or over).";
  }
  if (!v.confirmed_accurate) e.confirmed_accurate = "Confirm the details are correct.";
  return e;
}

/** Database error → field message. */
export const TAX_DETAILS_DB_ERRORS: [RegExp, string][] = [
  [/invalid_tin|tin_required/, "Check your tax reference."], [/invalid_vat_number/, "Enter the VAT number with its country prefix, e.g. GB123456789."],
  [/invalid_company_number|company_number_required/, "Check the company number."], [/invalid_date_of_birth/, "Enter your date of birth (you must be 18 or over)."],
  [/address_required|invalid_country/, "Add your full address."], [/confirmation_required/, "Confirm the details are correct."],
  [/step_up_required/, "Verify your second factor, then save again."], [/not_authorized/, "Only the workspace owner or a finance member can add tax details."],
];

export type ReportRow = {
  workspace_id: string; seller_name: string; seller_type: string | null; legal_name: string | null; date_of_birth: string | null; tin: string | null;
  tin_country: string | null; tin_not_issued: boolean; vat_number: string | null; company_number: string | null; address: string | null; country: string | null;
  activity: string; quarter: number; consideration_minor: number; activities: number; fees_minor: number; currency: string | null; details_complete: boolean;
};

const CSV_COLS: (keyof ReportRow)[] = ["workspace_id", "seller_name", "seller_type", "legal_name", "date_of_birth", "tin", "tin_country", "tin_not_issued",
  "vat_number", "company_number", "address", "country", "activity", "quarter", "consideration_minor", "activities", "fees_minor", "currency", "details_complete"];
/** CSV cell: quoted, and a leading = + - @ is neutralised (spreadsheet formula injection). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function reportCsv(rows: ReportRow[]): string {
  return [CSV_COLS.join(","), ...rows.map(r => CSV_COLS.map(c => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

const xml = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
/**
 * XML-ready export: one <ReportableSeller> per seller with quarterly totals, using the OECD DPI element names where they map
 * cleanly. NOT validated against HMRC's schema — the submission file must be produced/checked against HMRC's current DPI XML schema
 * (verify) before filing.
 */
export function reportXml(year: number, rows: ReportRow[], platform = { name: "Blackwellen Limited (Gala Dock)", vat: "GB508480488" }): string {
  const by = new Map<string, ReportRow[]>();
  for (const r of rows) by.set(r.workspace_id, [...(by.get(r.workspace_id) ?? []), r]);
  const sellers = [...by.values()].map(rs => {
    const r = rs[0]!;
    const q = [1, 2, 3, 4].map(n => {
      const qs = rs.filter(x => x.quarter === n);
      return `<Q${n}><Consideration currency="${xml(r.currency ?? "GBP")}">${qs.reduce((a, x) => a + Number(x.consideration_minor), 0)}</Consideration><NumberOfActivities>${qs.reduce((a, x) => a + Number(x.activities), 0)}</NumberOfActivities><Fees>${qs.reduce((a, x) => a + Number(x.fees_minor), 0)}</Fees></Q${n}>`;
    }).join("");
    const id = r.seller_type === "individual"
      ? `<Individual><Name>${xml(r.legal_name)}</Name><BirthDate>${xml(r.date_of_birth)}</BirthDate></Individual>`
      : `<Entity><Name>${xml(r.legal_name ?? r.seller_name)}</Name><BusinessRegistrationNumber>${xml(r.company_number)}</BusinessRegistrationNumber></Entity>`;
    return `<ReportableSeller ref="${xml(r.workspace_id)}" complete="${r.details_complete}">${id}<TIN issuedBy="${xml(r.tin_country)}" unknown="${r.tin_not_issued}">${xml(r.tin)}</TIN><VAT>${xml(r.vat_number)}</VAT><Address country="${xml(r.country)}">${xml(r.address)}</Address><RelevantActivities activity="${xml([...new Set(rs.map(x => x.activity))].join(" "))}">${q}</RelevantActivities></ReportableSeller>`;
  }).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- XML-ready draft: validate against HMRC's DPI schema before submission (verify). Amounts in minor units. -->\n<DPI_Draft reportingPeriod="${year}"><PlatformOperator><Name>${xml(platform.name)}</Name><VAT>${xml(platform.vat)}</VAT></PlatformOperator>\n  ${sellers}\n</DPI_Draft>\n`;
}
