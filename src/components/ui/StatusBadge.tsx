import { cn } from "@/lib/utils";

type Status =
  | "new-enquiry" | "briefing" | "quoting" | "awaiting-approval"
  | "confirmed" | "in-delivery" | "completed" | "cancelled"
  | "active" | "inactive" | "pending" | "overdue" | "paid"
  | "unpaid" | "draft" | "sent" | "approved" | "rejected"
  | "preferred" | "archived" | "at-risk" | "missing" | "verified"
  | "open" | "in-progress" | "resolved" | "closed"
  | "trialing" | "past-due" | "suspended" | "operational" | "degraded" | "down"
  | "expired" | "partial" | "void" | "accepted";

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
