// Capability-based permissions (master spec §99). Code checks capabilities, never role names.
// This file is the single source of truth: `scripts/gen-foundation-sql.mjs` seeds `role_permissions`
// from it, and the database function `has_permission()` enforces the same matrix server-side.

export const organizerPermissions = [
  "events.read", "events.write", "events.delete", "sales.read", "sales.write", "marketplace.request",
  "tickets.manage", "promotion.manage", "team.manage", "finance.read", "finance.write", "refunds.approve",
  "agent.use", "agent.approve", "settings.manage",
] as const;

export const providerPermissions = [
  "opportunities.read", "opportunities.respond", "bookings.read", "bookings.manage", "availability.manage",
  "listings.manage", "team.manage", "money.read", "payouts.read", "quotes.send", "booking.accept",
  "agent.use", "agent.approve", "settings.manage",
] as const;

export type OrganizerPermission = typeof organizerPermissions[number];
export type ProviderPermission = typeof providerPermissions[number];
export type Permission = OrganizerPermission | ProviderPermission;
export type WorkspaceKind = "organizer" | "provider";
export type WorkspaceRole = "owner" | "manager" | "member" | "finance";

/** Role → capability matrix. Owners hold every capability for their workspace kind. */
export const rolePermissions: Record<WorkspaceKind, Record<WorkspaceRole, readonly Permission[]>> = {
  organizer: {
    owner: organizerPermissions,
    manager: ["events.read", "events.write", "sales.read", "sales.write", "marketplace.request", "tickets.manage", "promotion.manage", "team.manage", "finance.read", "agent.use", "agent.approve"],
    member: ["events.read", "events.write", "sales.read", "marketplace.request", "agent.use"],
    finance: ["events.read", "finance.read", "finance.write", "refunds.approve", "agent.use"],
  },
  provider: {
    owner: providerPermissions,
    manager: ["opportunities.read", "opportunities.respond", "bookings.read", "bookings.manage", "availability.manage", "listings.manage", "team.manage", "money.read", "quotes.send", "booking.accept", "agent.use", "agent.approve"],
    member: ["opportunities.read", "bookings.read", "availability.manage", "agent.use"],
    finance: ["bookings.read", "money.read", "payouts.read", "agent.use"],
  },
};

export function can(kind: WorkspaceKind, role: string, permission: Permission): boolean {
  const granted = rolePermissions[kind][role as WorkspaceRole];
  return !!granted && granted.includes(permission);
}
