import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, countryPack, countriesByRegion, SUPPORTED_CURRENCIES, DEFAULT_COUNTRY } from "@/lib/i18n/countries";
import { formatCurrency } from "@/lib/utils";

test("country registry covers the requested markets", () => {
  for (const code of ["GB", "US", "CA", "FR", "DE", "AE", "SA", "QA", "JP", "TW", "SG", "TH", "CH", "GL"]) {
    assert.ok(COUNTRIES[code], `missing country ${code}`);
  }
});

test("countryPack falls back to default for unknown codes", () => {
  assert.equal(countryPack("ZZ").code, DEFAULT_COUNTRY);
  assert.equal(countryPack(null).code, DEFAULT_COUNTRY);
});

test("GCC countries are RTL", () => {
  for (const code of ["AE", "SA", "QA"]) assert.equal(COUNTRIES[code].rtl, true);
});

test("region filter returns members", () => {
  assert.ok(countriesByRegion("GCC").length === 3);
  assert.ok(countriesByRegion("NA").length === 2);
});

test("supported currencies include the key ones", () => {
  for (const c of ["GBP", "USD", "EUR", "CHF", "AED", "SAR", "JPY", "SGD"]) {
    assert.ok(SUPPORTED_CURRENCIES.includes(c), `missing currency ${c}`);
  }
});

test("formatCurrency is locale + currency aware (backward compatible)", () => {
  assert.match(formatCurrency(1000), /£1,000/); // default en-GB/GBP unchanged
  assert.ok(formatCurrency(1000, "USD", "en-US").includes("$"));
  assert.ok(formatCurrency(1000, "JPY", "ja-JP").includes("￥") || formatCurrency(1000, "JPY", "ja-JP").includes("¥"));
});

test("resolveWorkspaceLocale prefers explicit columns, falls back to country pack", async () => {
  const { resolveWorkspaceLocale } = await import("@/lib/i18n/workspace-locale");
  const sa = resolveWorkspaceLocale({ country: "SA" });
  assert.equal(sa.currency, "SAR");
  assert.equal(sa.rtl, true);
  const custom = resolveWorkspaceLocale({ country: "FR", currency: "EUR", locale: "fr-FR" });
  assert.equal(custom.locale, "fr-FR");
  assert.ok(custom.privacy.includes("GDPR"));
  const fallback = resolveWorkspaceLocale({ country: null });
  assert.equal(fallback.country, "GB");
});
