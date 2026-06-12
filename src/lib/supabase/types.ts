export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── Enums (USER-DEFINED types) ─────────────────────────────────────────────

export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer";
export type UserRoleKind = "platform_admin" | "support";
export type EventStatus =
  | "new_enquiry"
  | "briefing"
  | "quoting"
  | "awaiting_approval"
  | "confirmed"
  | "in_delivery"
  | "completed"
  | "cancelled";
export type SupplierStatus = "active" | "preferred" | "pending" | "archived";
export type EventSupplierStatus = "invited" | "confirmed" | "declined" | "cancelled";
export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type QuoteStatus = "draft" | "sent" | "received" | "accepted" | "rejected" | "expired";
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "void"
  | "partially_paid";
export type BillingPlan = "starter" | "growth" | "enterprise";
export type BillingSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "paused";
export type LibraryAssetKind =
  | "image"
  | "video"
  | "document"
  | "audio"
  | "template"
  | "event_pack";
export type LibraryAssetVisibility = "workspace" | "private";
export type RunSheetLane = "setup" | "supplier" | "internal" | "event";
export type SmartRuleTrigger =
  | "event_created"
  | "event_status_changed"
  | "task_overdue"
  | "invoice_overdue"
  | "supplier_doc_missing";
export type SmartRuleAction =
  | "send_notification"
  | "create_task"
  | "send_email"
  | "change_status";

// ── Row types ──────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  owner_user_id: string;
  branding: Json;
  timezone: string;
  currency: string;
  locale: string;
  activated_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  deleted_at: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_details_submitted: boolean;
  stripe_connect_payouts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_file_id: string | null;
  timezone: string;
  locale: string;
  active_workspace_id: string | null;
  prefer_otp: boolean;
  onboarding_state: Json;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
  invited_by: string | null;
  joined_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  workspace_id: string;
  name: string;
  status: EventStatus;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  description: string | null;
  venue_id: string | null;
  venue_name_snapshot: string | null;
  venue_address_snapshot: string | null;
  venue_capacity_snapshot: number | null;
  cover_path: string | null;
  slug: string | null;
  flagged: boolean;
  flagged_reason: string | null;
  deleted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EventTask {
  id: string;
  workspace_id: string;
  event_id: string;
  title: string;
  status: string;
  due_at: string | null;
  position: number;
  assignee_user_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EventSupplier {
  id: string;
  workspace_id: string;
  event_id: string;
  supplier_id: string;
  role_on_event: string | null;
  status: EventSupplierStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventFile {
  id: string;
  workspace_id: string;
  event_id: string;
  storage_key: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  caption: string | null;
  uploaded_by: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface EventRunSheetItem {
  id: string;
  workspace_id: string;
  event_id: string;
  title: string;
  notes: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  position: number;
  section: string | null;
  lane: RunSheetLane | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  workspace_id: string;
  name: string;
  category_id: string | null;
  status: SupplierStatus;
  rating_internal: number | null;
  default_currency: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  website: string | null;
  notes: string | null;
  logo_path: string | null;
  last_used_at: string | null;
  archived_at: string | null;
  flagged: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  list_id: string;
  event_id: string | null;
  supplier_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  workspace_id: string;
  event_id: string | null;
  supplier_id: string;
  code: string;
  status: QuoteStatus;
  scope: string | null;
  notes: string | null;
  currency: string;
  deadline: string | null;
  sent_at: string | null;
  received_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteLine {
  id: string;
  workspace_id: string;
  quote_id: string;
  catalog_item_id: string | null;
  description: string;
  qty_x100: number;
  unit_price_cents: number;
  tax_pct_x100: number;
  line_total_cents: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  event_id: string | null;
  supplier_id: string | null;
  quote_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  currency: string;
  issued_on: string | null;
  due_on: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  notes: string | null;
  archived_at: string | null;
  stripe_payment_link_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  workspace_id: string;
  description: string;
  quantity: number;
  unit_cost_cents: number;
  tax_rate_bps: number;
  position: number;
  created_at: string;
}

export interface LibraryAsset {
  id: string;
  workspace_id: string;
  owner_user_id: string | null;
  kind: LibraryAssetKind;
  title: string;
  description: string | null;
  storage_path: string | null;
  mime: string | null;
  size_bytes: number;
  tags: string[];
  collection_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  visibility: LibraryAssetVisibility;
  pinned_at: string | null;
  deleted_at: string | null;
  use_count: number;
  last_used_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface SmartRule {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_kind: SmartRuleTrigger;
  trigger_params: Json;
  conditions: Json;
  action_kind: SmartRuleAction;
  action_params: Json;
  enabled: boolean;
  dry_run: boolean;
  fire_count: number;
  last_fired_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Notification {
  id: string;
  workspace_id: string;
  user_id: string;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Json;
  read_at: string | null;
  created_at: string;
}

export interface BillingSubscription {
  id: string;
  workspace_id: string;
  plan: BillingPlan;
  status: BillingSubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Database type (minimal — extend as needed) ────────────────────────────

export interface Database {
  public: {
    Tables: {
      workspaces: { Row: Workspace; Insert: Partial<Workspace>; Update: Partial<Workspace> };
      workspace_members: { Row: WorkspaceMember; Insert: Partial<WorkspaceMember>; Update: Partial<WorkspaceMember> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      events: { Row: Event; Insert: Partial<Event>; Update: Partial<Event> };
      event_tasks: { Row: EventTask; Insert: Partial<EventTask>; Update: Partial<EventTask> };
      event_suppliers: { Row: EventSupplier; Insert: Partial<EventSupplier>; Update: Partial<EventSupplier> };
      event_files: { Row: EventFile; Insert: Partial<EventFile>; Update: Partial<EventFile> };
      event_run_sheet_items: { Row: EventRunSheetItem; Insert: Partial<EventRunSheetItem>; Update: Partial<EventRunSheetItem> };
      suppliers: { Row: Supplier; Insert: Partial<Supplier>; Update: Partial<Supplier> };
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> };
      quotes: { Row: Quote; Insert: Partial<Quote>; Update: Partial<Quote> };
      quote_lines: { Row: QuoteLine; Insert: Partial<QuoteLine>; Update: Partial<QuoteLine> };
      invoices: { Row: Invoice; Insert: Partial<Invoice>; Update: Partial<Invoice> };
      invoice_line_items: { Row: InvoiceLineItem; Insert: Partial<InvoiceLineItem>; Update: Partial<InvoiceLineItem> };
      library_assets: { Row: LibraryAsset; Insert: Partial<LibraryAsset>; Update: Partial<LibraryAsset> };
      smart_rules: { Row: SmartRule; Insert: Partial<SmartRule>; Update: Partial<SmartRule> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      billing_subscriptions: { Row: BillingSubscription; Insert: Partial<BillingSubscription>; Update: Partial<BillingSubscription> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      workspace_member_role: WorkspaceMemberRole;
      event_status: EventStatus;
      supplier_status: SupplierStatus;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      quote_status: QuoteStatus;
      invoice_status: InvoiceStatus;
    };
  };
}
