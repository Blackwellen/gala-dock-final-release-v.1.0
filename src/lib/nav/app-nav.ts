// Gala Dock — persona-aware app navigation (F3 + nav restructure).
//
// One nav source, grouped into labelled sections, filtered by workspace_type (persona)
// and the resolved flag map. App (organizer) routes live under /event-manager/*.
//
// Restructure (see docs/audits/NAV_RESTRUCTURE_AUDIT.md):
//   - organizer nav grouped into Overview / Pipeline / Delivery / Revenue / Workspace
//   - "Venue Ops" (venue-management) removed from organizer — it's the venue persona's surface
//   - RFQs consolidated under Suppliers (no longer a top-level organizer item)
//
// See docs/specs/README.md (F3) and src/lib/flags/*.

import {
  LayoutDashboard,
  Megaphone,
  CalendarDays,
  CalendarRange,
  Building2,
  Hotel,
  Users2,
  ClipboardList,
  CheckSquare,
  UsersRound,
  Banknote,
  MessageSquare,
  FolderOpen,
  Settings2,
  Ticket,
  Store,
  Briefcase,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { FlagKey, WorkspaceType } from "@/lib/flags/registry";
import type { FlagMap } from "@/lib/flags/resolve";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When set, the item only shows if this resolved flag is true. */
  flag?: FlagKey;
};

export type NavGroup = {
  /** Optional section header. */
  label?: string;
  items: NavItem[];
};

const EM = "/event-manager";

/** Per-persona grouped navigation. Items with a `flag` are gated by the resolver. */
export const NAV_GROUPS_BY_TYPE: Record<WorkspaceType, NavGroup[]> = {
  organizer: [
    {
      items: [
        { href: `${EM}/home`, label: "Home", icon: LayoutDashboard },
        { href: `${EM}/calendar`, label: "Calendar", icon: CalendarRange, flag: "calendarHub" },
      ],
    },
    {
      label: "Delivery",
      items: [
        { href: `${EM}/leads`, label: "Sales", icon: Megaphone },
        { href: `${EM}/events`, label: "Events", icon: CalendarDays },
        { href: `${EM}/suppliers`, label: "Suppliers", icon: Users2 },
        { href: `${EM}/venues`, label: "Venues", icon: Building2 },
        { href: `${EM}/tasks`, label: "Tasks", icon: CheckSquare },
      ],
    },
    {
      label: "Revenue",
      items: [
        { href: `${EM}/finance`, label: "Finance", icon: Banknote },
        { href: `${EM}/tickets`, label: "Ticketing", icon: Ticket, flag: "ticketing" },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: `${EM}/inbox`, label: "Inbox", icon: MessageSquare },
        { href: `${EM}/automations`, label: "Automations", icon: Workflow, flag: "automationsBuilder" },
        { href: `${EM}/team`, label: "Team", icon: UsersRound },
        { href: `${EM}/library`, label: "Library", icon: FolderOpen },
        { href: `${EM}/settings`, label: "Settings", icon: Settings2 },
      ],
    },
  ],
  venue: [
    {
      items: [
        { href: `${EM}/home`, label: "Home", icon: LayoutDashboard },
        { href: `${EM}/venue-management`, label: "My Venues", icon: Hotel },
        { href: `${EM}/calendar`, label: "Availability", icon: CalendarRange, flag: "calendarHub" },
      ],
    },
    {
      label: "Listings",
      items: [
        { href: `${EM}/marketplace/listings`, label: "My Listings", icon: Store, flag: "marketplaceVenue" },
        { href: `${EM}/suppliers`, label: "Suppliers", icon: Users2 },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: `${EM}/finance`, label: "Finance", icon: Banknote },
        { href: `${EM}/team`, label: "Team", icon: UsersRound },
        { href: `${EM}/inbox`, label: "Inbox", icon: MessageSquare },
        { href: `${EM}/settings`, label: "Settings", icon: Settings2 },
      ],
    },
  ],
  supplier: [
    {
      items: [
        { href: `${EM}/home`, label: "Home", icon: LayoutDashboard },
        { href: `${EM}/jobs`, label: "Jobs", icon: Briefcase },
        { href: `${EM}/rfqs`, label: "RFQs", icon: ClipboardList },
        { href: `${EM}/calendar`, label: "Availability", icon: CalendarRange, flag: "calendarHub" },
      ],
    },
    {
      label: "Listings",
      items: [
        { href: `${EM}/marketplace/listings`, label: "My Listings", icon: Store, flag: "marketplaceSupplier" },
      ],
    },
    {
      label: "Workspace",
      items: [
        { href: `${EM}/finance`, label: "Earnings", icon: Banknote },
        { href: `${EM}/team`, label: "Team", icon: UsersRound },
        { href: `${EM}/inbox`, label: "Inbox", icon: MessageSquare },
        { href: `${EM}/settings`, label: "Settings", icon: Settings2 },
      ],
    },
  ],
};

/** Grouped nav for a persona, flag-filtered, with empty groups dropped. */
export function buildAppNavGroups(workspaceType: WorkspaceType, flags?: Partial<FlagMap>): NavGroup[] {
  const groups = NAV_GROUPS_BY_TYPE[workspaceType] ?? NAV_GROUPS_BY_TYPE.organizer;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.flag || flags?.[it.flag] === true) }))
    .filter((g) => g.items.length > 0);
}

/** Flat nav for a persona (convenience / tests). */
export function buildAppNav(workspaceType: WorkspaceType, flags?: Partial<FlagMap>): NavItem[] {
  return buildAppNavGroups(workspaceType, flags).flatMap((g) => g.items);
}

/** Human label for a persona (used in the workspace strip / onboarding). */
export const WORKSPACE_TYPE_LABEL: Record<WorkspaceType, string> = {
  organizer: "Event Organizer",
  venue: "Venue Operator",
  supplier: "Supplier",
};
