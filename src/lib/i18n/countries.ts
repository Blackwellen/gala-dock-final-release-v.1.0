// Gala Dock — Internationalisation country/region registry (INTL-0).
//
// Single source of truth for supported countries: locale, currency, tax system, privacy
// regime, RTL, and rollout region. Every module (finance, tax, legal, calendar, forms,
// payments) reads from here so localisation is consistent and gated per country.
//
// V1 is en-GB / GBP only; other countries ship behind the INTL rollout flags (see
// docs/specs/README.md — INTL track). Adding a country here does not enable it.

export type Region = "UK" | "NA" | "EU" | "EFTA" | "GCC" | "APAC";

export interface CountryPack {
  /** ISO-3166-1 alpha-2. */
  code: string;
  name: string;
  region: Region;
  /** Default BCP-47 locale. */
  locale: string;
  /** All supported locales for this country (multilingual markets). */
  locales: string[];
  /** ISO-4217 currency. */
  currency: string;
  rtl: boolean;
  /** Indirect-tax system label (drives the tax engine / invoice compliance). */
  taxSystem: string;
  /** Mandatory e-invoicing scheme, if any. */
  eInvoicing?: string;
  /** Applicable privacy/compliance regimes (drives the legal country pack). */
  privacy: string[];
}

export const COUNTRIES: Record<string, CountryPack> = {
  GB: { code: "GB", name: "United Kingdom", region: "UK", locale: "en-GB", locales: ["en-GB"], currency: "GBP", rtl: false, taxSystem: "VAT", privacy: ["UK-GDPR", "PECR"] },

  // North America
  US: { code: "US", name: "United States", region: "NA", locale: "en-US", locales: ["en-US", "es-US"], currency: "USD", rtl: false, taxSystem: "Sales & Use Tax (state/local)", privacy: ["CCPA/CPRA", "state-privacy", "CAN-SPAM"] },
  CA: { code: "CA", name: "Canada", region: "NA", locale: "en-CA", locales: ["en-CA", "fr-CA"], currency: "CAD", rtl: false, taxSystem: "GST/HST/PST/QST", privacy: ["PIPEDA", "Quebec-Law-25", "CASL"] },

  // Europe (EU)
  FR: { code: "FR", name: "France", region: "EU", locale: "fr-FR", locales: ["fr-FR"], currency: "EUR", rtl: false, taxSystem: "VAT (TVA)", eInvoicing: "Factur-X / PPF (phased)", privacy: ["GDPR", "ePrivacy"] },
  DE: { code: "DE", name: "Germany", region: "EU", locale: "de-DE", locales: ["de-DE"], currency: "EUR", rtl: false, taxSystem: "VAT (USt)", eInvoicing: "XRechnung / ZUGFeRD (B2B phased)", privacy: ["GDPR", "ePrivacy"] },
  BE: { code: "BE", name: "Belgium", region: "EU", locale: "nl-BE", locales: ["nl-BE", "fr-BE", "de-BE"], currency: "EUR", rtl: false, taxSystem: "VAT (BTW/TVA)", eInvoicing: "Peppol (B2B 2026)", privacy: ["GDPR", "ePrivacy"] },
  ES: { code: "ES", name: "Spain", region: "EU", locale: "es-ES", locales: ["es-ES", "ca-ES"], currency: "EUR", rtl: false, taxSystem: "VAT (IVA)", eInvoicing: "Veri*factu / SII", privacy: ["GDPR", "ePrivacy"] },
  PT: { code: "PT", name: "Portugal", region: "EU", locale: "pt-PT", locales: ["pt-PT"], currency: "EUR", rtl: false, taxSystem: "VAT (IVA)", eInvoicing: "ATCUD / SAF-T", privacy: ["GDPR", "ePrivacy"] },
  IT: { code: "IT", name: "Italy", region: "EU", locale: "it-IT", locales: ["it-IT"], currency: "EUR", rtl: false, taxSystem: "VAT (IVA)", eInvoicing: "FatturaPA / SdI", privacy: ["GDPR", "ePrivacy"] },
  SE: { code: "SE", name: "Sweden", region: "EU", locale: "sv-SE", locales: ["sv-SE"], currency: "SEK", rtl: false, taxSystem: "VAT (Moms)", privacy: ["GDPR", "ePrivacy"] },
  DK: { code: "DK", name: "Denmark", region: "EU", locale: "da-DK", locales: ["da-DK"], currency: "DKK", rtl: false, taxSystem: "VAT (Moms)", privacy: ["GDPR", "ePrivacy"] },
  FI: { code: "FI", name: "Finland", region: "EU", locale: "fi-FI", locales: ["fi-FI", "sv-FI"], currency: "EUR", rtl: false, taxSystem: "VAT (ALV)", privacy: ["GDPR", "ePrivacy"] },
  AT: { code: "AT", name: "Austria", region: "EU", locale: "de-AT", locales: ["de-AT"], currency: "EUR", rtl: false, taxSystem: "VAT (USt)", privacy: ["GDPR", "ePrivacy"] },
  HU: { code: "HU", name: "Hungary", region: "EU", locale: "hu-HU", locales: ["hu-HU"], currency: "HUF", rtl: false, taxSystem: "VAT (ÁFA)", eInvoicing: "NAV Online Invoice", privacy: ["GDPR", "ePrivacy"] },
  HR: { code: "HR", name: "Croatia", region: "EU", locale: "hr-HR", locales: ["hr-HR"], currency: "EUR", rtl: false, taxSystem: "VAT (PDV)", eInvoicing: "Fiskalizacija 2.0", privacy: ["GDPR", "ePrivacy"] },
  GL: { code: "GL", name: "Greenland", region: "EU", locale: "kl-GL", locales: ["kl-GL", "da-DK"], currency: "DKK", rtl: false, taxSystem: "No VAT (special)", privacy: ["Danish-DPA"] },

  // EFTA
  CH: { code: "CH", name: "Switzerland", region: "EFTA", locale: "de-CH", locales: ["de-CH", "fr-CH", "it-CH"], currency: "CHF", rtl: false, taxSystem: "VAT (MWST/TVA/IVA)", privacy: ["nFADP", "GDPR-extraterritorial"] },

  // GCC (RTL, Arabic-first)
  AE: { code: "AE", name: "United Arab Emirates", region: "GCC", locale: "ar-AE", locales: ["ar-AE", "en-AE"], currency: "AED", rtl: true, taxSystem: "VAT 5%", eInvoicing: "UAE e-Invoicing (2026)", privacy: ["UAE-PDPL"] },
  SA: { code: "SA", name: "Saudi Arabia", region: "GCC", locale: "ar-SA", locales: ["ar-SA", "en-SA"], currency: "SAR", rtl: true, taxSystem: "VAT 15%", eInvoicing: "ZATCA FATOORAH", privacy: ["KSA-PDPL"] },
  QA: { code: "QA", name: "Qatar", region: "GCC", locale: "ar-QA", locales: ["ar-QA", "en-QA"], currency: "QAR", rtl: true, taxSystem: "No VAT (planned)", privacy: ["Qatar-PDPPL"] },

  // APAC
  TH: { code: "TH", name: "Thailand", region: "APAC", locale: "th-TH", locales: ["th-TH", "en-TH"], currency: "THB", rtl: false, taxSystem: "VAT 7%", eInvoicing: "e-Tax Invoice", privacy: ["Thai-PDPA"] },
  JP: { code: "JP", name: "Japan", region: "APAC", locale: "ja-JP", locales: ["ja-JP", "en-JP"], currency: "JPY", rtl: false, taxSystem: "Consumption Tax", eInvoicing: "Qualified Invoice (JCT)", privacy: ["APPI"] },
  TW: { code: "TW", name: "Taiwan", region: "APAC", locale: "zh-TW", locales: ["zh-TW", "en-TW"], currency: "TWD", rtl: false, taxSystem: "Business Tax (VAT)", eInvoicing: "GUI / e-Invoice", privacy: ["Taiwan-PDPA"] },
  SG: { code: "SG", name: "Singapore", region: "APAC", locale: "en-SG", locales: ["en-SG", "zh-SG"], currency: "SGD", rtl: false, taxSystem: "GST", eInvoicing: "InvoiceNow (Peppol)", privacy: ["Singapore-PDPA"] },
};

export const DEFAULT_COUNTRY = "GB";

export function countryPack(code: string | null | undefined): CountryPack {
  return (code && COUNTRIES[code]) || COUNTRIES[DEFAULT_COUNTRY];
}

export function countriesByRegion(region: Region): CountryPack[] {
  return Object.values(COUNTRIES).filter((c) => c.region === region);
}

/** Distinct currencies across all packs (for multi-currency pricing/FX). */
export const SUPPORTED_CURRENCIES = Array.from(
  new Set(Object.values(COUNTRIES).map((c) => c.currency))
).sort();

/** All privacy regimes referenced (for the legal compliance pack matrix). */
export const PRIVACY_REGIMES = Array.from(
  new Set(Object.values(COUNTRIES).flatMap((c) => c.privacy))
).sort();
