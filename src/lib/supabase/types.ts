// Schema-accurate domain types for Gala Dock.
// `database.types.ts` is generated from the live Supabase project — do not edit by hand.
// This file derives ergonomic row/enum aliases from it so app code stays aligned to the schema.

import type { Database, Json } from "./database.types";

export type { Database, Json };

// ── Generic helpers ─────────────────────────────────────────────────────────
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

// ── Core domain row aliases ─────────────────────────────────────────────────
export type Workspace = Tables<"workspaces">;
export type WorkspaceMember = Tables<"workspace_members">;
export type Profile = Tables<"profiles">;
export type Client = Tables<"clients">;

export type Event = Tables<"events">;
export type EventTask = Tables<"event_tasks">;
export type EventSupplier = Tables<"event_suppliers">;
export type EventFile = Tables<"event_files">;
export type EventRunSheetItem = Tables<"event_run_sheet_items">;

export type Supplier = Tables<"suppliers">;
export type SupplierCategory = Tables<"supplier_categories">;
export type SupplierContact = Tables<"supplier_contacts">;

export type Task = Tables<"tasks">;
export type TaskList = Tables<"task_lists">;
export type TaskAssignee = Tables<"task_assignees">;
export type TaskComment = Tables<"task_comments">;
export type TaskChecklistItem = Tables<"task_checklist_items">;
export type TaskDependency = Tables<"task_dependencies">;
export type TaskWatcher = Tables<"task_watchers">;
export type TaskAttachment = Tables<"task_attachments">;
export type TaskActivity = Tables<"task_activity">;
export type TaskStatusHistory = Tables<"task_status_history">;
export type TaskTemplate = Tables<"task_templates">;
export type TaskTemplateItem = Tables<"task_template_items">;
export type TaskTemplateUsage = Tables<"task_template_usage">;

export type Quote = Tables<"quotes">;
export type QuoteLine = Tables<"quote_lines">;
export type Invoice = Tables<"invoices">;
export type InvoiceLineItem = Tables<"invoice_line_items">;
export type InvoicePayment = Tables<"invoice_payments">;

export type LibraryAsset = Tables<"library_assets">;
export type SmartRule = Tables<"smart_rules">;
export type Notification = Tables<"notifications">;
export type BillingSubscription = Tables<"billing_subscriptions">;
export type Venue = Tables<"venues">;

// ── Commercial-depth feature row aliases ────────────────────────────────────
export type Lead = Tables<"leads">;
export type LeadActivity = Tables<"lead_activities">;
export type Proposal = Tables<"proposals">;
export type ProposalLineItem = Tables<"proposal_line_items">;
export type EventGuest = Tables<"event_guests">;
export type Communication = Tables<"communications">;
export type InvoicePaymentSchedule = Tables<"invoice_payment_schedules">;
export type Form = Tables<"forms">;
export type FormField = Tables<"form_fields">;
export type FormSubmission = Tables<"form_submissions">;
export type VenueDocument = Tables<"venue_documents">;
export type VenueNote = Tables<"venue_notes">;

// ── Levels 11-15 feature row aliases ────────────────────────────────────────
export type SupplierRateCard = Tables<"supplier_rate_cards">;
export type SupplierBlockedDate = Tables<"supplier_blocked_dates">;
export type SupplierRating = Tables<"supplier_ratings">;
export type Rfq = Tables<"rfqs">;
export type RfqRecipient = Tables<"rfq_recipients">;
export type SupplierContract = Tables<"supplier_contracts">;
export type EventStaffAssignment = Tables<"event_staff_assignments">;
export type TeamAvailabilityBlock = Tables<"team_availability_blocks">;
export type EventFloorPlan = Tables<"event_floor_plans">;
export type VenueSpace = Tables<"venue_spaces">;
export type VenueBooking = Tables<"venue_bookings">;
export type VenueFbPackage = Tables<"venue_fb_packages">;
export type VenueBookingFbSelection = Tables<"venue_booking_fb_selections">;
export type VenueStaffAssignment = Tables<"venue_staff_assignments">;
export type EventMoodBoard = Tables<"event_mood_boards">;
export type MoodBoardItem = Tables<"mood_board_items">;
export type EventExpense = Tables<"event_expenses">;
export type EventExpensePayment = Tables<"event_expense_payments">;
export type EventDeposit = Tables<"event_deposits">;
export type EventDepositPayment = Tables<"event_deposit_payments">;
export type SupplierPaymentBatch = Tables<"supplier_payment_batches">;
export type Timesheet = Tables<"timesheets">;
export type PayrollExport = Tables<"payroll_exports">;
export type TicketOrder = Tables<"ticket_orders">;
export type TicketType = Tables<"ticket_types">;
export type FinanceActivityLogEntry = Tables<"finance_activity_log">;

// ── Enum aliases (schema-accurate) ──────────────────────────────────────────
export type WorkspaceMemberRole = Enums<"workspace_role">;
// events.status is a text column (not a PG enum) — keep the known lifecycle values.
export type EventStatus =
  | "new_enquiry" | "briefing" | "quoting" | "awaiting_approval"
  | "confirmed" | "in_delivery" | "completed" | "cancelled";
export type SupplierStatus = Enums<"supplier_status">;
export type TaskStatus = Enums<"task_status">;
export type TaskPriority = Enums<"task_priority">;
export type QuoteStatus = Enums<"quote_status">;
export type InvoiceStatus = Enums<"invoice_status">;

// ── Feature string-literal enums (text columns, not PG enums) ────────────────
export type LeadStage =
  | "new-enquiry" | "contacted" | "proposal-sent" | "negotiating" | "won" | "lost";
export type LeadSource =
  | "website" | "referral" | "instagram" | "facebook" | "email" | "phone" | "walk-in" | "other";
export type ProposalStatus =
  | "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "converted";
export type GuestType = "day" | "evening" | "both";
export type RSVPStatus = "pending" | "confirmed" | "declined" | "maybe";
export type CommDirection = "inbound" | "outbound" | "internal";
export type CommType = "email" | "call" | "note" | "sms" | "whatsapp" | "meeting";
export type PaymentScheduleStatus = "pending" | "paid" | "overdue";
export type FormType = "enquiry" | "rsvp" | "feedback" | "supplier-info" | "custom";
export type FormStatus = "draft" | "published" | "archived";
export type FieldType =
  | "short-text" | "long-text" | "select" | "multi-select" | "date" | "number" | "file-upload" | "section-header";
export type VenueDocType =
  | "hire-agreement" | "floorplan" | "health-safety" | "insurance" | "capacity-certificate" | "site-map" | "other";
