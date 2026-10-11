// Shared shape of the organizer's professional ticket setup (stored in events.settings.ticket_pro). Client-safe.

export type SectionType = "standing" | "reserved" | "vip" | "accessible" | "hold";
export type ProSection = { id: string; name: string; type: SectionType; capacity: number; color: string; tiers: string[]; holds: number };
export type ProPhase = { id: string; name: string; starts_at: string | null };
export type Question = { key: string; label: string; on: boolean; required: boolean; custom?: boolean };
export type ProSettings = {
  model: "general" | "reserved" | "hybrid"; capacity: number; buffer_pct: number; map_source: "venue" | "custom" | "upload"; map_image: string | null;
  sections: ProSection[]; phases: ProPhase[];
  sales: { order_limit: number; min_age: number; timezone: string; waiting_list: boolean; resale: boolean; show_remaining: boolean; countdown: boolean; require_account: boolean; discount_codes: boolean; referral: boolean };
  access: {
    transfers: boolean; resale: boolean; resale_cap: number; fee_buyer: number; fee_seller: number;
    refund: "none" | "date" | "flexible" | "cancel"; refund_cutoff: string | null; refund_amount: 100 | 50;
    questions: Question[]; fee_display: "upfront" | "included" | "checkout";
    terms_template: string; require_terms: boolean; age_message: boolean; age_text: string; info_text: string;
    comps: number; companion: boolean; accessible_seats: number;
    ticket_display: "qr" | "visual" | "barcode"; ticket_display_switch: boolean;
  };
};

export const SECTION_TYPES: Record<SectionType, string> = { standing: "Standing (GA)", reserved: "Reserved", vip: "Standing (VIP)", accessible: "Accessible", hold: "Hold" };
export const TIER_KINDS: Record<string, string> = { general: "General", early: "Early bird", vip: "VIP", group: "Group", accessible: "Accessible", comp: "Comp", student: "Student", press: "Press" };
export const TERMS_TEMPLATES = ["Standard Event Ticket Terms (v2.1)", "Festival & Outdoor Terms (v1.4)", "Seated Venue Terms (v1.2)"] as const;

export const PRO_DEFAULTS: ProSettings = {
  model: "general", capacity: 500, buffer_pct: 5, map_source: "venue", map_image: null, sections: [], phases: [],
  sales: { order_limit: 10, min_age: 0, timezone: "Europe/London", waiting_list: true, resale: true, show_remaining: true, countdown: true, require_account: false, discount_codes: true, referral: true },
  access: {
    transfers: true, resale: true, resale_cap: 100, fee_buyer: 5, fee_seller: 5, refund: "date", refund_cutoff: null, refund_amount: 100,
    questions: [
      { key: "full_name", label: "Full name", on: true, required: true }, { key: "email", label: "Email address", on: true, required: true },
      { key: "dob", label: "Date of birth", on: false, required: false }, { key: "dietary", label: "Dietary requirements", on: true, required: false },
      { key: "accessibility", label: "Accessibility needs", on: true, required: false },
    ],
    fee_display: "upfront", terms_template: TERMS_TEMPLATES[0], require_terms: true, age_message: false, age_text: "", info_text: "", comps: 0, companion: true, accessible_seats: 0,
    ticket_display: "qr", ticket_display_switch: true,
  },
};

/** Fee model used for the buyer-facing example (platform 5% + card processing 2.9% + 30p). */
export function feeExample(price: number, display: ProSettings["access"]["fee_display"]) {
  const service = Math.round(price * 5) / 100; const processing = Math.round((price * 0.029 + 0.3) * 100) / 100;
  return { price, service, processing, total: display === "included" ? price : Math.round((price + service + processing) * 100) / 100 };
}
