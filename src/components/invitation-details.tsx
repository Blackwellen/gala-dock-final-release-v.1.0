import { Moon, Store, CalendarDays, Users, BarChart3, Bell, Wallet } from "lucide-react";

export type InvitePreview = { workspace_name: string; workspace_kind: string; role: string; invited_by_name: string; expires_at: string; state: string; days_remaining?: number };

const roleLabels: Record<string, string> = { manager: "Event Manager", member: "Team Member", finance: "Finance & Payments" };
const permissions: Record<string, [typeof CalendarDays, string, string][]> = {
  manager: [[CalendarDays, "Create and manage events", "Plan, edit and run workspace events"], [Users, "Collaborate with the team", "Communicate and coordinate in one place"], [BarChart3, "Manage offerings and bookings", "Update services, availability, and details"], [Bell, "Get important notifications", "Receive event updates and messages"]],
  member: [[CalendarDays, "View and work on assigned events", "Access the events you’re added to"], [Users, "Collaborate with the team", "Communicate and coordinate in one place"], [Bell, "Get important notifications", "Receive event updates and messages"]],
  finance: [[Wallet, "Manage invoices and payments", "Review payouts, invoices and transactions"], [BarChart3, "View financial reports", "Track revenue and costs"], [Bell, "Get payment notifications", "Receive payment and payout updates"]],
};

export function InvitationSummary({ invite }: { invite: InvitePreview | null }) {
  const expires = invite ? new Date(invite.expires_at) : null;
  const days = invite?.days_remaining ?? 0;
  const kind = invite?.workspace_kind === "provider" ? "Provider" : "Organizer";
  const role = invite ? roleLabels[invite.role] ?? invite.role : "Member";
  return <>
    <section className="invitation-summary">
      <div className="invitation-workspace"><span className="invitation-mark">{invite?.workspace_kind === "provider" ? <Store aria-hidden="true" /> : <Moon aria-hidden="true" />}</span><span><b>{invite?.workspace_name ?? "Invitation unavailable"}</b><small>{invite ? `${kind} workspace` : "Open the link from your invitation email"}</small></span></div>
      <div><small>Your role</small><span className="badge"><Users size={17} aria-hidden="true" />{role}</span></div>
      <div><small>Invited by</small><span className="invitation-owner"><span className="initial-avatar small" aria-hidden="true">{(invite?.invited_by_name ?? "?").slice(0, 1)}</span><span><b>{invite?.invited_by_name ?? "—"}</b><small>{invite ? `${kind} · ${invite.workspace_name}` : ""}</small></span></span></div>
      <div><small>Expires</small><span className="invitation-expiry"><CalendarDays size={22} aria-hidden="true" /><span>{expires ? expires.toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }) : "—"}<small>{invite?.state === "valid" ? `in ${days} day${days === 1 ? "" : "s"}` : invite?.state === "expired" ? "Expired" : ""}</small></span></span></div>
    </section>
    {invite && <><h3 className="invitation-perks-title">What you’ll be able to do</h3>
      <div className="invitation-perks">{(permissions[invite.role] ?? permissions.member).map(([Icon, title, description]) => <div key={title}><Icon size={24} aria-hidden="true" /><span><b>{title}</b><small>{description}</small></span></div>)}</div></>}
  </>;
}
