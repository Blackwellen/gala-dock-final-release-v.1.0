// Human labels for the live smart-rules engine (7 triggers, 5 actions).
// These are the values the smart_rules table + automation worker actually understand.

export const SMART_RULE_TRIGGERS = [
  { value: "invoice_overdue", label: "Invoice overdue" },
  { value: "quote_unread_after", label: "Quote unread for a while" },
  { value: "task_due_in", label: "Task due soon" },
  { value: "event_stage_changed", label: "Event stage changed" },
  { value: "supplier_no_reply", label: "Supplier hasn't replied" },
  { value: "file_uploaded", label: "File uploaded" },
  { value: "nightly_cron", label: "Nightly schedule" },
] as const;

export const SMART_RULE_ACTIONS = [
  { value: "send_email", label: "Send email" },
  { value: "create_task", label: "Create task" },
  { value: "notify_user", label: "Notify user" },
  { value: "set_tag", label: "Set tag" },
  { value: "webhook_internal_only", label: "Internal webhook" },
] as const;

export const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(
  SMART_RULE_TRIGGERS.map((t) => [t.value, t.label])
);
export const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  SMART_RULE_ACTIONS.map((a) => [a.value, a.label])
);
