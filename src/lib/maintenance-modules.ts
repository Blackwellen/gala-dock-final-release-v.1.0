// Client-safe list of maintenance modules (mirrors the check constraint on public.maintenance_windows.modules).
export const MODULES = ["marketplace", "tickets", "checkout", "payments", "agent", "media", "messaging", "api", "auth", "provider", "organizer", "customer", "portals", "checkin", "resale"] as const;
export type Module = (typeof MODULES)[number];
