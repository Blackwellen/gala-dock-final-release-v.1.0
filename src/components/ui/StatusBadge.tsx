import { cn } from "@/lib/utils";

type Status =
  | "new-enquiry" | "briefing" | "quoting" | "awaiting-approval"
  | "confirmed" | "in-delivery" | "completed" | "cancelled"
  | "active" | "inactive" | "pending" | "overdue" | "paid"
  | "unpaid" | "draft" | "sent" | "approved" | "rejected"
  | "preferred" | "archived" | "at-risk" | "missing" | "verified"
  | "open" | "in-progress" | "resolved" | "closed"
  | "trialing" | "past-due" | "suspended" | "operational" | "degraded" | "down"
  | "expired" | "partial" | "void" | "accepted"
  // Lead stages / proposal / RSVP / forms
  | "contacted" | "proposal-sent" | "negotiating" | "won" | "lost"
  | "viewed" | "signed" | "declined" | "converted" | "maybe" | "published"
  // Finance section: supplier bills, payments, timesheets, tickets, deposits
  | "pending-review" | "awaiting-finance" | "disputed" | "on-hold"
  | "scheduled" | "processing" | "part-paid" | "failed" | "refunded"
  | "reconciled" | "unreconciled" | "exception"
  | "submitted" | "exported" | "due-soon" | "waived" | "forfeited"
  | "healthy" | "monitor" | "at-risk-cashflow"
  // Automations section: run/approval/error/integration statuses
  | "queued" | "running" | "waiting-approval" | "skipped"
  | "review-requested" | "invalid" | "changes-requested" | "escalated"
  | "connected" | "disconnected" | "critical" | "warning" | "info-severity"
  | "investigating" | "paused" | "delivered" | "rate-limited";

const STATUS_MAP: Record<Status, { label: string; classes: string }> = {
  "new-enquiry":       { label: "New Enquiry",      classes: "bg-info-50     text-info-600     border-info-200" },
  "briefing":          { label: "Briefing",          classes: "bg-violet-50   text-violet-600   border-violet-200" },
  "quoting":           { label: "Quoting",           classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "awaiting-approval": { label: "Awaiting Approval", classes: "bg-brand-50    text-brand-600    border-brand-200" },
  "confirmed":         { label: "Confirmed",         classes: "bg-success-50  text-success-600  border-success-200" },
  "in-delivery":       { label: "In Delivery",       classes: "bg-brand-50    text-brand-700    border-brand-200" },
  "completed":         { label: "Completed",         classes: "bg-surface-100 text-surface-600  border-surface-200" },
  "cancelled":         { label: "Cancelled",         classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "active":            { label: "Active",            classes: "bg-success-50  text-success-700  border-success-200" },
  "inactive":          { label: "Inactive",          classes: "bg-surface-100 text-surface-500  border-surface-200" },
  "pending":           { label: "Pending",           classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "overdue":           { label: "Overdue",           classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "paid":              { label: "Paid",              classes: "bg-success-50  text-success-700  border-success-200" },
  "unpaid":            { label: "Unpaid",            classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "draft":             { label: "Draft",             classes: "bg-surface-100 text-surface-500  border-surface-200" },
  "sent":              { label: "Sent",              classes: "bg-info-50     text-info-600     border-info-200" },
  "approved":          { label: "Approved",          classes: "bg-success-50  text-success-700  border-success-200" },
  "rejected":          { label: "Rejected",          classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "preferred":         { label: "Preferred",         classes: "bg-brand-50    text-brand-700    border-brand-200" },
  "archived":          { label: "Archived",          classes: "bg-surface-100 text-surface-400  border-surface-200" },
  "at-risk":           { label: "At Risk",           classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "missing":           { label: "Missing",           classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "verified":          { label: "Verified",          classes: "bg-success-50  text-success-700  border-success-200" },
  "open":              { label: "Open",              classes: "bg-info-50     text-info-600     border-info-200" },
  "in-progress":       { label: "In Progress",       classes: "bg-brand-50    text-brand-600    border-brand-200" },
  "resolved":          { label: "Resolved",          classes: "bg-success-50  text-success-700  border-success-200" },
  "closed":            { label: "Closed",            classes: "bg-surface-100 text-surface-500  border-surface-200" },
  "trialing":          { label: "Trialing",          classes: "bg-violet-50   text-violet-600   border-violet-200" },
  "past-due":          { label: "Past Due",          classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "suspended":         { label: "Suspended",         classes: "bg-danger-50   text-danger-700   border-danger-200" },
  "operational":       { label: "Operational",       classes: "bg-success-50  text-success-700  border-success-200" },
  "degraded":          { label: "Degraded",          classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "down":              { label: "Down",              classes: "bg-danger-50   text-danger-700   border-danger-200" },
  "expired":           { label: "Expired",           classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "partial":           { label: "Partial",           classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "void":              { label: "Void",              classes: "bg-surface-100 text-surface-400  border-surface-200" },
  "accepted":          { label: "Accepted",          classes: "bg-success-50  text-success-700  border-success-200" },
  "contacted":         { label: "Contacted",         classes: "bg-info-50     text-info-600     border-info-200" },
  "proposal-sent":     { label: "Proposal Sent",     classes: "bg-violet-50   text-violet-600   border-violet-200" },
  "negotiating":       { label: "Negotiating",       classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "won":               { label: "Won",               classes: "bg-success-50  text-success-700  border-success-200" },
  "lost":              { label: "Lost",              classes: "bg-surface-100 text-surface-500  border-surface-200" },
  "viewed":            { label: "Viewed",            classes: "bg-info-50     text-info-600     border-info-200" },
  "signed":            { label: "Signed",            classes: "bg-success-50  text-success-700  border-success-200" },
  "declined":          { label: "Declined",          classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "converted":         { label: "Converted",         classes: "bg-brand-50    text-brand-700    border-brand-200" },
  "maybe":             { label: "Maybe",             classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "published":         { label: "Published",         classes: "bg-success-50  text-success-700  border-success-200" },
  "pending-review":    { label: "Pending Review",     classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "awaiting-finance":  { label: "Awaiting Finance",   classes: "bg-brand-50    text-brand-600    border-brand-200" },
  "disputed":          { label: "Disputed",           classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "on-hold":           { label: "On Hold",            classes: "bg-surface-100 text-surface-600  border-surface-200" },
  "scheduled":         { label: "Scheduled",          classes: "bg-info-50     text-info-600     border-info-200" },
  "processing":        { label: "Processing",         classes: "bg-info-50     text-info-600     border-info-200" },
  "part-paid":         { label: "Part Paid",          classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "failed":            { label: "Failed",             classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "refunded":          { label: "Refunded",           classes: "bg-violet-50   text-violet-600   border-violet-200" },
  "reconciled":        { label: "Reconciled",         classes: "bg-success-50  text-success-700  border-success-200" },
  "unreconciled":      { label: "Unreconciled",       classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "exception":         { label: "Exception",          classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "submitted":         { label: "Submitted",          classes: "bg-info-50     text-info-600     border-info-200" },
  "exported":          { label: "Exported",           classes: "bg-brand-50    text-brand-700    border-brand-200" },
  "due-soon":          { label: "Due Soon",           classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "waived":            { label: "Waived",             classes: "bg-surface-100 text-surface-500  border-surface-200" },
  "forfeited":         { label: "Forfeited",          classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "healthy":           { label: "Healthy",            classes: "bg-success-50  text-success-700  border-success-200" },
  "monitor":           { label: "Monitor",            classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "at-risk-cashflow":  { label: "At Risk",            classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "queued":            { label: "Queued",             classes: "bg-surface-100 text-surface-600  border-surface-200" },
  "running":           { label: "Running",             classes: "bg-info-50     text-info-600     border-info-200" },
  "waiting-approval":  { label: "Waiting Approval",    classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "skipped":           { label: "Skipped",             classes: "bg-surface-100 text-surface-400  border-surface-200" },
  "review-requested":  { label: "Review Requested",    classes: "bg-brand-50    text-brand-600    border-brand-200" },
  "invalid":           { label: "Invalid",             classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "changes-requested": { label: "Changes Requested",   classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "escalated":         { label: "Escalated",           classes: "bg-danger-50   text-danger-600   border-danger-200" },
  "connected":         { label: "Connected",           classes: "bg-success-50  text-success-700  border-success-200" },
  "disconnected":      { label: "Disconnected",        classes: "bg-surface-100 text-surface-500  border-surface-200" },
  "critical":          { label: "Critical",            classes: "bg-danger-50   text-danger-700   border-danger-200" },
  "warning":           { label: "Warning",             classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "info-severity":     { label: "Info",                classes: "bg-info-50     text-info-600     border-info-200" },
  "investigating":     { label: "Investigating",       classes: "bg-brand-50    text-brand-600    border-brand-200" },
  "paused":            { label: "Paused",              classes: "bg-warning-50  text-warning-600  border-warning-200" },
  "delivered":         { label: "Delivered",           classes: "bg-success-50  text-success-700  border-success-200" },
  "rate-limited":      { label: "Rate Limited",        classes: "bg-warning-50  text-warning-600  border-warning-200" },
};

interface StatusBadgeProps {
  status: Status;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ status, dot = true, className }: StatusBadgeProps) {
  const { label, classes } = STATUS_MAP[status] ?? {
    label: status,
    classes: "bg-surface-100 text-surface-600 border-surface-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        classes,
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />}
      {label}
    </span>
  );
}
