// The single accessor for canonical master data (Q02). Client- and server-safe, synchronous, no I/O.
// SQL code uses the generated mirror instead: taxonomy_resolve(), is_currency(), is_timezone(), master_data_audit().
import { COUNTRIES, CURRENCIES, MASTER_DATA_VERSION, SURFACES, TAXONOMIES, TIMEZONES, normTerm, spellings, type Country, type Currency, type SurfaceName, type TaxonomyName, type Term, type Timezone } from "./catalog";

export { COUNTRIES, CURRENCIES, MASTER_DATA_VERSION, SURFACES, TAXONOMIES, TIMEZONES, normTerm, spellings };
export type { Country, Currency, SurfaceName, TaxonomyName, Term, Timezone };

export type Option = { key: string; label: string };

const cache = new Map<TaxonomyName, Map<string, string>>();
const lookup = (taxonomy: TaxonomyName) => { let m = cache.get(taxonomy); if (!m) cache.set(taxonomy, m = spellings(taxonomy)); return m; };

export const terms = (taxonomy: TaxonomyName, opts: { includeDeprecated?: boolean } = {}): readonly Term[] =>
  (TAXONOMIES[taxonomy].terms as readonly Term[]).filter(x => opts.includeDeprecated || !x.deprecated);
export const term = (taxonomy: TaxonomyName, key: string): Term | undefined => (TAXONOMIES[taxonomy].terms as readonly Term[]).find(x => x.key === key);
export const isTerm = (taxonomy: TaxonomyName, key: unknown): key is string => typeof key === "string" && !!term(taxonomy, key);

/**
 * Canonical key for any stored or typed value: a key, label, plural, legacy alias or nested value ("Entertainment > DJ"
 * resolves by its most specific part, then its top level). Returns null when nothing matches.
 */
export function resolveTerm(taxonomy: TaxonomyName, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const m = lookup(taxonomy), full = m.get(normTerm(value));
  if (full) return full;
  const parts = value.split(/\s*[>/|]\s*/).filter(Boolean);
  return m.get(normTerm(parts[parts.length - 1] ?? "")) ?? m.get(normTerm(parts[0] ?? "")) ?? null;
}
export const labelOf = (taxonomy: TaxonomyName, value: unknown, fallback = "") => {
  const key = resolveTerm(taxonomy, value);
  return (key && term(taxonomy, key)?.label) || (typeof value === "string" && value) || fallback;
};

/** The options a screen shows, in its designed order and wording. */
export function optionsFor(surface: SurfaceName): Option[] {
  const s = SURFACES[surface] as { taxonomy: TaxonomyName; form?: "label" | "plural"; items: readonly (string | readonly [string, string])[] };
  return s.items.map(item => {
    if (typeof item !== "string") return { key: item[0], label: item[1] };
    const x = term(s.taxonomy, item);
    if (!x) throw new Error(`Surface ${surface} references unknown ${s.taxonomy} key ${item}`);
    return { key: x.key, label: (s.form === "plural" ? x.plural : undefined) ?? x.label };
  });
}
/** Label-valued screens (the stored value is the wording). */
export const labelsFor = (surface: SurfaceName) => optionsFor(surface).map(o => o.label);

/** Build category a supplier category fills; venues always fill "venue"; anything unknown is "extras". */
export function buildCategoryOf(kind: string, category: string): string {
  if (kind === "venue") return "venue";
  const key = resolveTerm("service_category", category);
  return String((key && term("service_category", key)?.meta?.build) || "extras");
}

export const currencies = (opts: { transactional?: boolean } = {}) => CURRENCIES.filter(c => !opts.transactional || c.transactional);
export const isCurrency = (code: unknown, opts: { transactional?: boolean } = {}): code is string => typeof code === "string" && currencies(opts).some(c => c.code === code);
export const currencyOption = (c: Currency) => ({ value: c.code, label: `${c.code}${c.symbol !== c.code ? ` (${c.symbol})` : ""} – ${c.name}` });

export const countries = (opts: { business?: boolean } = {}) => COUNTRIES.filter(c => !opts.business || c.business);
export const countryBy = (codeOrName: unknown): Country | undefined => typeof codeOrName === "string" ? COUNTRIES.find(c => c.code === codeOrName.toUpperCase() || c.name === codeOrName) : undefined;
export const timezones = (country?: string): readonly Timezone[] => country ? TIMEZONES.filter(z => z.country === country) : TIMEZONES;
export const isTimezone = (tz: unknown): tz is string => typeof tz === "string" && TIMEZONES.some(z => z.tz === tz);
