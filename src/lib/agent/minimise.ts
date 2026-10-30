/**
 * Prompt data minimisation (Q41, domains 8 Context / 13 Data Guards). Everything a tool returns is minimised before it is placed in a
 * prompt: guest care and health data, private contact fields, internal notes and marketplace ranking internals never reach a model.
 * Tool outputs are still stored in full in agent_run_steps (RLS-scoped) for the humans who can already see them. Pure; no I/O.
 */
const DROP = new Set([
  // guest care / special-category data (owner + managers only, never AI)
  "guest_care", "dietary", "allergies", "allergy", "medical", "medical_notes", "health", "accessibility_needs", "access_needs", "care_notes", "emergency_contact",
  // private contact and identity fields
  "email", "phone", "mobile", "address", "date_of_birth", "dob", "attendee_email", "requester_email", "ip", "ip_address", "device", "user_agent",
  "beneficial_owners", "company_number", "tax_id", "iban", "account_number", "sort_code",
  // internal / private notes and evidence
  "internal_note", "internal_notes", "private_notes", "review_note", "evidence", "notes_private",
  // ranking internals (owner decision: ranking reasons stay internal)
  "reasons", "ranking_reasons", "score_breakdown", "ranking", "rank_features", "boost", "sponsored_boost",
  // secrets that must never be echoed even if a tool returned them by mistake
  "token", "secret", "api_key", "password", "qr_nonce", "nonce",
]);

export function minimise(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 200).map(v => minimise(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP.has(k.toLowerCase())) continue;
      out[k] = minimise(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  return value;
}

/** The keys minimise() removes (exported for tests and the governance doc). */
export const MINIMISED_KEYS = [...DROP];
