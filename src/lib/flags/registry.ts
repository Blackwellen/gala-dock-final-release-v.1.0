// Gala Dock — feature-flag registry (F1).
//
// Declarative gates. Each flag declares the minimum release stage at which it may be on,
// which workspace personas may see it, and (optionally) the minimum plan that unlocks it.
// The resolver (./resolve) combines these with per-workspace overrides + env master switches.
//
// Plan names below use the live `app_plan` enum: trial | free | starter | pro | business | enterprise.
// Marketing labels map as: pro = "Growth", business = "Scale", enterprise = "Enterprise"
// (see src/lib/billing/entitlements.ts PLAN_LABELS).
//
// See docs/MASTER-PLAN.md §4 and docs/specs/README.md.

export type ReleaseStage = "v1" | "v1_5" | "v2";
export type WorkspaceType = "organizer" | "venue" | "supplier";
export type PlanGate = "starter" | "pro" | "business" | "enterprise";

export type FlagSpec = {
  /** Minimum release stage at which this flag can be on. */
  minVersion: ReleaseStage;
  /** Personas allowed to see this flag. Omit = all personas. */
  workspaceTypes?: readonly WorkspaceType[];
  /** Minimum plan that unlocks it. Omit = no plan gate. */
  planGate?: PlanGate;
  /** Default when version + persona + plan allow it and no override is set. */
  default: "on" | "off";
  // NOTE: defaults are "on" — the version / persona / plan / env gates do the restricting.
  // Use "off" only for a feature that must stay opt-in even when fully entitled.
  /**
   * Optional env master-switch key (e.g. NEXT_PUBLIC_TICKETING_ENABLED). When set and the
   * env value is not exactly "true", the flag is forced OFF regardless of other gates —
   * lets V1.5/V2 code ship dark into production.
   */
  envSwitch?: string;
  description?: string;
};

export const RELEASE_STAGES: readonly ReleaseStage[] = ["v1", "v1_5", "v2"] as const;
export const WORKSPACE_TYPES: readonly WorkspaceType[] = ["organizer", "venue", "supplier"] as const;

export const FLAGS = {
  // ── V1 — Event Delivery OS (organizer) ───────────────────────────────────
  calendarHub:          { minVersion: "v1",   workspaceTypes: ["organizer"], planGate: "pro",      default: "on",  description: "Cross-section calendar hub" },
  aiCopilot:            { minVersion: "v1",   workspaceTypes: ["organizer"], planGate: "business",  default: "on", description: "AI Copilot (chat + tools + metering)" },
  automationsBuilder:   { minVersion: "v1",   workspaceTypes: ["organizer"], planGate: "business",  default: "on", description: "Automations builder over Smart Rules" },
  clientPortal:         { minVersion: "v1",   workspaceTypes: ["organizer"], planGate: "pro",      default: "on",  description: "Productized client portal" },
  supplierPortal:       { minVersion: "v1",   workspaceTypes: ["organizer"], planGate: "pro",      default: "on",  description: "Supplier token portal" },
  pwaEventDay:          { minVersion: "v1",                                                          default: "on",  description: "PWA offline event-day mode" },
  affiliateProgram:     { minVersion: "v1",                                  planGate: "starter",   default: "on",  description: "Affiliate program" },

  // ── V1.5 — Consumer + ticketing ──────────────────────────────────────────
  consumerAccounts:     { minVersion: "v1_5",                                default: "on", envSwitch: "NEXT_PUBLIC_CONSUMER_ENABLED",  description: "Consumer buyer accounts" },
  ticketing:            { minVersion: "v1_5", workspaceTypes: ["organizer"], planGate: "business", default: "on", envSwitch: "NEXT_PUBLIC_TICKETING_ENABLED", description: "Ticketing core + checkout" },
  publicEventPages:     { minVersion: "v1_5", workspaceTypes: ["organizer"], default: "on", envSwitch: "NEXT_PUBLIC_TICKETING_ENABLED", description: "Public event pages" },
  publicEventCalendar:  { minVersion: "v1_5", workspaceTypes: ["organizer"], default: "on", envSwitch: "NEXT_PUBLIC_TICKETING_ENABLED", description: "Per-organizer public events calendar + embeddable widget" },
  seatingBuilder:       { minVersion: "v1_5", workspaceTypes: ["organizer"], planGate: "pro", default: "on", description: "Floor plan / seating builder" },
  stripeConnect:        { minVersion: "v1_5",                                default: "on", envSwitch: "STRIPE_CONNECT_ENABLED", description: "Stripe Connect payouts" },

  // ── V2 — Multi-sided marketplace ─────────────────────────────────────────
  marketplaceVenue:     { minVersion: "v2", workspaceTypes: ["organizer", "venue"],    default: "on", envSwitch: "NEXT_PUBLIC_MARKETPLACE_ENABLED", description: "Venue marketplace" },
  marketplaceSupplier:  { minVersion: "v2", workspaceTypes: ["organizer", "supplier"], default: "on", envSwitch: "NEXT_PUBLIC_MARKETPLACE_ENABLED", description: "Supplier marketplace" },
  publicEventsDirectory:{ minVersion: "v2",                                  default: "on", envSwitch: "NEXT_PUBLIC_MARKETPLACE_ENABLED", description: "Cross-organizer public events directory + calendar" },
  escrow:               { minVersion: "v2",                                  default: "on", envSwitch: "ESCROW_ENABLED", description: "Escrow (milestone-delayed transfers)" },
  disputes:             { minVersion: "v2",                                  default: "on", description: "Disputes centre" },
  marketplaceAccounting:{ minVersion: "v2",                                  planGate: "enterprise", default: "on", description: "Multi-party accounting / GL + export" },
} as const satisfies Record<string, FlagSpec>;

export type FlagKey = keyof typeof FLAGS;
