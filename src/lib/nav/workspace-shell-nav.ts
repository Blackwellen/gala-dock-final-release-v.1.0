import {
  Banknote,
  Building2,
  CalendarRange,
  CheckSquare,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings2,
  Store,
  Users2,
  UsersRound,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { GalaWorkspaceSubtype, GalaWorkspaceType } from "@/mock-data/gala-dock/workspaces";

export type WorkspaceShellNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  children?: readonly { label: string; href: string }[];
};

export type WorkspaceShellNavGroup = { label: string; items: readonly WorkspaceShellNavItem[] };

const item = (id: string, label: string, icon: LucideIcon, children: readonly string[] = []): WorkspaceShellNavItem => ({
  id,
  label,
  href: id,
  icon,
  children: children.length ? children.map((child) => ({ label: child, href: `${id}/${child.toLowerCase().replaceAll(" ", "-")}` })) : undefined,
});

const ORGANIZER_NAV: readonly WorkspaceShellNavGroup[] = [
  { label: "Overview", items: [item("home", "Home", LayoutDashboard), item("calendar", "Calendar", CalendarRange)] },
  { label: "Sales", items: [item("sales", "Sales", Megaphone, ["Overview", "Leads", "Proposals", "Forms", "Analytics"])] },
  { label: "Delivery", items: [item("events", "Events", CalendarRange, ["Overview", "Programmes", "Templates"]), item("suppliers", "Suppliers", Users2, ["Overview", "Directory", "RFQs", "Scorecards", "Documents", "Contracts", "Availability"]), item("venues", "Venues", Building2, ["Overview", "Directory", "Holds", "Documents"]), item("marketplace", "Marketplace", Store, ["Overview", "Venues", "Services", "Requests", "Saved"]), item("tasks", "Tasks", CheckSquare, ["Overview", "Templates"])] },
  { label: "Revenue", items: [item("finance", "Finance", Banknote, ["Overview", "Quotes", "Invoices", "Payments", "Supplier Payments", "Deposits", "Expenses", "Profit", "Cashflow", "Ticket Sales"])] },
  { label: "Workspace", items: [item("inbox", "Inbox", MessageSquare), item("automations", "Automations", Workflow, ["Overview", "My Automations", "Recipes", "Runs", "Approvals", "Errors", "Integrations", "Usage"]), item("team", "Team", UsersRound, ["Overview", "Members", "Workload", "Availability", "Staffing Requests"]), item("settings", "Settings", Settings2, ["Account", "Workspace", "Billing", "Assets", "Security", "Audit"])] },
];

const VENUE_NAV: readonly WorkspaceShellNavGroup[] = [
  { label: "Overview", items: [item("home", "Home", LayoutDashboard)] },
  { label: "Operations", items: [item("my-venues", "My Venues", Building2, ["Overview", "Spaces", "Availability", "Bookings", "F&B", "Documents", "Pricing", "Reviews", "Staff"]), item("bookings", "Bookings", CalendarRange, ["Overview", "Enquiries", "Holds", "Tentative", "Confirmed", "Delivered", "Closed"]), item("availability", "Availability", CalendarRange)] },
  { label: "Marketplace Console", items: [item("marketplace-console", "Marketplace Console", Store, ["Overview", "Listings", "Enquiries", "Reviews", "Payouts", "Verification"]), item("suppliers", "Suppliers", Users2, ["Overview", "Preferred", "Documents", "RFQs"])] },
  { label: "Workspace", items: [item("finance", "Finance", Banknote), item("team", "Team", UsersRound), item("inbox", "Inbox", MessageSquare), item("settings", "Settings", Settings2, ["Account", "Workspace", "Billing", "Assets", "Security", "Audit"])] },
];

const SUPPLIER_NAV: readonly WorkspaceShellNavGroup[] = [
  { label: "Overview", items: [item("home", "Home", LayoutDashboard)] },
  { label: "Delivery", items: [item("jobs", "Jobs", Wrench, ["Overview", "Assigned", "In Progress", "Evidence", "Completed"]), item("rfqs", "RFQs", ClipboardList, ["Overview", "Invited", "Draft Responses", "Submitted", "Awarded", "Closed"]), item("quotes", "Quotes", CircleDollarSign, ["Overview", "Draft", "Sent", "Accepted", "Declined", "Expired"]), item("availability", "Availability", CalendarRange)] },
  { label: "Marketplace Console", items: [item("marketplace-console", "Marketplace Console", Store, ["Overview", "Listings", "Enquiries", "Reviews", "Payouts", "Verification"])] },
  { label: "Workspace", items: [item("earnings", "Earnings", Banknote, ["Overview", "Receivables", "Payouts", "Expenses", "Tax Export"]), item("team", "Team", UsersRound, ["Overview", "Members", "Rota", "Availability"]), item("inbox", "Inbox", MessageSquare), item("settings", "Settings", Settings2, ["Account", "Business Profile", "Documents", "Payouts", "Billing", "Security"])] },
];

export function getWorkspaceShellNav(type: GalaWorkspaceType, subtype: GalaWorkspaceSubtype): readonly WorkspaceShellNavGroup[] {
  if (type === "venue") return VENUE_NAV;
  if (type === "supplier") {
    return subtype === "supplier-solo"
      ? SUPPLIER_NAV.map((group) => group.label === "Workspace" ? { ...group, items: group.items.filter((entry) => entry.id !== "team") } : group)
      : SUPPLIER_NAV;
  }
  return ORGANIZER_NAV;
}
