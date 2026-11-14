/* Q69 public header account menu: pure link building (no server or browser APIs, unit-tested in tests/release/q69-public-header-account.spec.ts). */

export type SeatAccess = { kind: string; member_status?: string | null; workspace_status?: string | null; onboarding_complete?: boolean | null };

/** What the server hands the header for a signed-in visitor. Counts only: no notification text, no conversation content. */
export type SiteAccount = {
  name: string;
  email: string;
  initial: string;
  avatar: string | null;
  seats: { organizer: boolean; provider: boolean; partner: boolean; admin: boolean };
  unreadMessages: boolean;
  notifications: number;
};

export type AccountLinkKey = "home" | "organizer" | "provider" | "partner" | "admin" | "messages" | "notifications" | "settings" | "help";
export type AccountLink = { key: AccountLinkKey; href: string; label: string; group: "workspace" | "activity" | "account" };

/** A seat counts only when it can actually be opened: active membership in an active, onboarded workspace. */
export const usableSeat = (w: SeatAccess, kind: "organizer" | "provider") =>
  w.kind === kind && w.member_status === "active" && w.workspace_status === "active" && w.onboarding_complete === true;

export function seatsFrom(access: readonly SeatAccess[] | null | undefined, flags: { partner: boolean; admin: boolean }): SiteAccount["seats"] {
  const list = Array.isArray(access) ? access : [];
  return { organizer: list.some(w => usableSeat(w, "organizer")), provider: list.some(w => usableSeat(w, "provider")), partner: !!flags.partner, admin: !!flags.admin };
}

/** Badge text for the notifications count: nothing at 0, capped at 99+. */
export const countLabel = (n: number) => (!Number.isFinite(n) || n <= 0 ? "" : n > 99 ? "99+" : String(Math.floor(n)));

export function initialOf(name: string) {
  const c = name.trim().slice(0, 1).toUpperCase();
  return /\p{L}|\p{N}/u.test(c) ? c : "G";
}

/** Menu order: every signed-in person has the customer area ("Go to my events"); workspace links follow for each seat held. */
export function buildAccountLinks(account: Pick<SiteAccount, "seats">): AccountLink[] {
  const s = account.seats;
  const links: AccountLink[] = [{ key: "home", href: "/home", label: "Go to my events", group: "workspace" }];
  if (s.organizer) links.push({ key: "organizer", href: "/organizer", label: "Organiser workspace", group: "workspace" });
  if (s.provider) links.push({ key: "provider", href: "/provider", label: "Provider workspace", group: "workspace" });
  if (s.partner) links.push({ key: "partner", href: "/partner", label: "Partner portal", group: "workspace" });
  if (s.admin) links.push({ key: "admin", href: "/admin", label: "Admin console", group: "workspace" });
  links.push(
    { key: "messages", href: "/account/inbox", label: "Messages", group: "activity" },
    { key: "notifications", href: "/home", label: "Notifications", group: "activity" },
    { key: "settings", href: "/account", label: "Account settings", group: "account" },
    { key: "help", href: "/help", label: "Help", group: "account" },
  );
  return links;
}

/** Roving focus inside the open menu: arrows wrap, Home/End jump; anything else is not ours. */
export function nextMenuIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
