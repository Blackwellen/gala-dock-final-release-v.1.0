/**
 * Public liability insurance minimums (owner decision D10, Q54 2026-11-14): £1,000,000 per occurrence as standard; £2,000,000 or
 * more for higher-risk categories. Pure module. Database mirror: public.credential_requirements (migration 202611147401) — the
 * trust engine (trust_listing_rules / trust_credential_eval) enforces it; tests/release/q74-legal-engineering.spec.ts checks the two
 * agree. Supplier Terms v3 §4.3 and the Provider settings credentials card use the same figures.
 */
export const STANDARD_PUBLIC_LIABILITY_MINOR = 100_000_000;     // £1,000,000 (pence)
export const HIGHER_RISK_PUBLIC_LIABILITY_MINOR = 200_000_000;  // £2,000,000 (pence)

/**
 * Higher-risk categories (credential_requirements.category) and why. Broker/counsel to confirm the list before launch.
 *  - Security: crowd management, door supervision, physical intervention.
 *  - AV & Production: staging, rigging, lighting towers, special effects and pyrotechnics (work at height, falling objects, fire).
 *  - Marquees & Structures: temporary structures, inflatables and rides (collapse, wind loading, public use).
 */
export const HIGHER_RISK_CATEGORIES: Readonly<Record<string, string>> = {
  "Security": "Crowd management, door supervision and physical intervention",
  "AV & Production": "Staging, rigging, lighting, special effects and pyrotechnics",
  "Marquees & Structures": "Temporary structures, inflatables and rides",
};

export function publicLiabilityMinimum(category: string | null | undefined): number {
  return category && Object.prototype.hasOwnProperty.call(HIGHER_RISK_CATEGORIES, category) ? HIGHER_RISK_PUBLIC_LIABILITY_MINOR : STANDARD_PUBLIC_LIABILITY_MINOR;
}

export const INSURANCE_COPY = {
  standard: "Public liability insurance of at least £1,000,000 per occurrence.",
  higherRisk: "Public liability insurance of at least £2,000,000 per occurrence (higher-risk category: security, staging/rigging/special effects, or temporary structures, inflatables and rides).",
  minimum: (minor: number) => `Minimum cover: £${(minor / 100).toLocaleString("en-GB")} per occurrence.`,
} as const;
