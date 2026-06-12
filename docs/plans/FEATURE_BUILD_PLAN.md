# Gala Dock — V1.5 / V2 / V3 Feature Build Plan

**Date:** June 2026  
**Build state entering this plan:** V1 — 101 pages, clean build, dev server :3003  
**Plan scope:** 25 commercial-depth features across 15 build levels, 102 steps  
**Constraint:** Zero new mandatory paid APIs. Stripe, WhatsApp, SMS, Xero = optional addons noted where relevant.  
**Goal:** Best event management platform in the market — agency-first, supplier-deep, AI-embedded, venue-capable.

---

## API COST RULES (Non-negotiable)

| Integration | Decision | Reason |
|---|---|---|
| E-signature (DocuSign, Adobe Sign) | ❌ Not used | UK law accepts checkbox + typed name. Free to build. |
| Chart libraries (Chart.js, Recharts) | ❌ Not used | Pure CSS bar charts. No bundle cost. |
| SMS at V1 (Twilio) | ❌ Not V1 | Listed as V2 addon. No mandatory cost. |
| WhatsApp Business API | ❌ Not V1 | V2 addon, gated behind add-on billing |
| Email sending at V1 | ❌ Not V1 | In-app comms log only. No Resend/SendGrid required. |
| Stripe payment links | ⚠ Optional | Schema ready (`stripe_payment_link_url`). UI stub built. Activation = Stripe keys in env. |
| Xero / QuickBooks | ❌ Not V1.5 | V2 medium-term. Listed but not in this plan. |
| Anthropic / OpenAI | ⚠ Existing | AI Copilot already has mock mode. New AI features use same mock/real toggle. |
| Supabase | ✅ Already running | All DB work is additive migrations only. No new project. |

---

## NAVIGATION DECISION

The current sidebar has 7 items (Home, Events, Suppliers, Tasks, Finance, Library, Settings). This plan adds 4 major new sections. The options are:

**Option 1 — Expand sidebar to 10 items** *(recommended)*  
Add: Leads, Venues, Inbox — each as a first-class sidebar item. Reports lives inside Finance as a tab (already constrained by the "no Reports in sidebar" rule from AGENTS.md). This is the right call for commercial depth — every competitor exposes Leads and Inbox at the top level. Sidebar grows to 10 items, which is standard for a platform at this complexity.

**Option 2 — Sub-navigation nesting**  
Leads → under Events. Venues → under Suppliers. Inbox → under Events or a notification bell. Reports → under Finance. Keeps the sidebar at 7 but buries features that should be first-class.

**Decision: Option 1 for Leads, Venues, Inbox. Reports into Finance tabs.**  
The "7 items only" constraint was V1 scoping. V1.5 with CRM, Inbox, and Venue management requires 10 items. Update AppSidebar in Step 5.

New sidebar order: Home → Leads → Events → Venues → Suppliers → Tasks → Finance → Inbox → Library → Settings

---

## LEVEL STRUCTURE

| Level | Theme | Steps | Features |
|---|---|---|---|
| **1** | Foundation | 1–6 | DB schema, types, shared primitives, nav |
| **2** | Leads CRM | 7–12 | Pipeline, kanban, detail, convert-to-event |
| **3** | Proposals + E-Sign | 13–18 | Wizard, detail, signature, convert-to-invoice |
| **4** | Guest Management | 19–22 | Guests tab, RSVP, meal choices, CSV import |
| **5** | Reports & Analytics | 23–28 | 6-tab reports section, CSS charts |
| **6** | Communication Inbox | 29–33 | Inbox hub, thread view, event Comms tab |
| **7** | Finance Enhancements | 34–38 | Payment schedules, BEO export, Stripe stub |
| **8** | Form Builder + Client Portal | 39–45 | Field builder, public form, portal routes |
| **9** | Venue CRM (Option A) | 46–51 | Register, detail, event wizard integration |
| **10** | Polish & Ship V1.5 | 52–56 | Nav, StatusBadge, proxy, audit, checklist |
| **11** | Supplier Management Depth | 57–63 | RFQ engine, comparison matrix, live portal, rate cards, availability, scoring |
| **12** | Team & Staffing | 64–69 | Event assignments, workload dashboard, shift scheduling, run sheet assignments, team calendar, availability |
| **13** | Floor Plan Builder | 70–75 | SVG canvas, element library, guest seating, multi-layout, print/export |
| **14** | Venue-Side Management (Option B) | 76–90 | Dual-sided platform — spaces, availability calendar, booking lifecycle, F&B packages, BEO, staff scheduling, venue portal, multi-venue dashboard |
| **15** | Final Feature Layer | 91–102 | Mood board, guest QR check-in, expense tracking, supplier contracts, milestone countdown, white-label portal, PWA + offline event day |

---

## LEVEL 1 — FOUNDATION

*Do this first. Every other level depends on it. Build nothing from Levels 2–9 until these 6 steps are done.*

---

### Step 1 — Database Migration Plan (all new tables)

**What:** Define all new tables in a single migration document. Migrations are additive only — no changes to existing tables except where noted. All new tables include `workspace_id` for tenant isolation and RLS policies.

**New tables:**

```sql
-- LEADS
leads (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  title text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  company_name text,
  event_type text,
  event_date date,
  event_location text,
  guest_count_estimate integer,
  budget_estimate_pence bigint,
  stage text NOT NULL DEFAULT 'new-enquiry',
    -- values: new-enquiry | contacted | proposal-sent | negotiating | won | lost
  source text,
    -- values: website | referral | instagram | facebook | email | phone | walk-in | other
  assigned_to uuid REFERENCES auth.users(id),
  converted_event_id uuid,  -- FK to events table when won
  lost_reason text,
  notes text,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

lead_activities (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail text,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- PROPOSALS
proposals (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  lead_id uuid REFERENCES leads(id),
  event_id uuid,  -- set after conversion
  title text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  event_type text,
  event_date date,
  event_location text,
  guest_count integer,
  intro_text text,
  terms_text text,
  status text NOT NULL DEFAULT 'draft',
    -- values: draft | sent | viewed | signed | declined | expired | converted
  valid_until date,
  total_pence bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  signed_by_name text,
  signed_by_email text,
  signed_at timestamptz,
  signed_ip text,
  converted_invoice_id uuid,
  share_token text UNIQUE,  -- public URL token
  viewed_at timestamptz,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

proposal_line_items (
  id uuid PK default gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price_pence bigint NOT NULL DEFAULT 0,
  total_pence bigint GENERATED ALWAYS AS (quantity::bigint * unit_price_pence) STORED,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GUEST MANAGEMENT
event_guests (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid NOT NULL,  -- FK to events
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  guest_type text NOT NULL DEFAULT 'day',
    -- values: day | evening | both
  rsvp_status text NOT NULL DEFAULT 'pending',
    -- values: pending | confirmed | declined | maybe
  meal_choice text,
  dietary_notes text,
  table_number text,
  seat_number text,
  plus_one_name text,
  notes text,
  imported_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- COMMUNICATIONS
communications (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid,   -- optional link to event
  lead_id uuid,    -- optional link to lead
  subject text,
  body text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
    -- values: inbound | outbound | internal
  comm_type text NOT NULL DEFAULT 'email',
    -- values: email | call | note | sms | whatsapp | meeting
  participant_name text,
  participant_email text,
  participant_phone text,
  thread_id uuid,  -- groups messages into threads
  is_read boolean NOT NULL DEFAULT false,
  attachments jsonb DEFAULT '[]',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PAYMENT SCHEDULES
invoice_payment_schedules (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  invoice_id uuid NOT NULL,  -- FK to invoices
  label text NOT NULL,  -- e.g. "Deposit", "Interim Payment", "Final Balance"
  amount_pence bigint NOT NULL,
  percentage numeric,  -- if percentage-based (e.g. 33.33)
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
    -- values: pending | paid | overdue
  paid_at timestamptz,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FORMS
forms (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  form_type text NOT NULL DEFAULT 'custom',
    -- values: enquiry | rsvp | feedback | supplier-info | custom
  status text NOT NULL DEFAULT 'draft',
    -- values: draft | published | archived
  share_token text UNIQUE,
  submission_count integer NOT NULL DEFAULT 0,
  event_id uuid,  -- optional link, auto-creates lead on enquiry forms
  settings jsonb DEFAULT '{}',
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

form_fields (
  id uuid PK default gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  field_type text NOT NULL,
    -- values: short-text | long-text | select | multi-select | date | number | file-upload | section-header
  label text NOT NULL,
  placeholder text,
  options jsonb DEFAULT '[]',  -- for select/multi-select: ["Option 1", "Option 2"]
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  settings jsonb DEFAULT '{}'
);

form_submissions (
  id uuid PK default gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',  -- {field_id: value}
  submitter_email text,
  submitter_name text,
  ip_address text,
  user_agent text,
  created_lead_id uuid,  -- if form created a lead
  created_at timestamptz NOT NULL DEFAULT now()
);

-- VENUES
venues (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  venue_type text,
    -- values: hotel | country-house | conference | outdoor | restaurant | barn | manor | other
  address_line1 text,
  address_line2 text,
  city text,
  county text,
  postcode text,
  country text NOT NULL DEFAULT 'GB',
  capacity_day integer,
  capacity_evening integer,
  hire_fee_min_pence bigint,
  hire_fee_max_pence bigint,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  f_and_b_minimum_pence bigint,
  setup_hours numeric,
  breakdown_hours numeric,
  parking_spaces integer,
  accessibility_notes text,
  notes text,
  status text NOT NULL DEFAULT 'active',
    -- values: preferred | active | inactive | archived
  cover_path text,  -- Supabase Storage key
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

venue_documents (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
    -- values: hire-agreement | floorplan | health-safety | insurance | capacity-certificate | site-map | other
  filename text NOT NULL,
  storage_key text NOT NULL,
  file_size_bytes bigint,
  expiry_date date,
  status text NOT NULL DEFAULT 'active',
    -- values: active | expiring-soon | expired
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

venue_notes (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**RLS pattern to apply on every new table:**
```sql
-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Workspace isolation policy (repeat for each table)
CREATE POLICY "workspace_isolation" ON leads
  FOR ALL USING (workspace_id = (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND status = 'active'
    LIMIT 1
  ));
```

**Existing table additions (additive only):**
```sql
-- Add to events table (if not already present, verify first):
-- venue_id, venue_name_snapshot, venue_address_snapshot, venue_capacity_snapshot
-- Already confirmed in schema from V1 codebase read — no change needed.

-- Add share_token to proposals and forms for public URL generation:
-- Already included in the CREATE statements above.
```

**File:** Run via Supabase dashboard SQL editor or migration file at `supabase/migrations/`

---

### Step 2 — TypeScript Types Update (`src/lib/supabase/types.ts`)

**What:** Add TypeScript interfaces for all new tables from Step 1. Follow the exact same pattern as existing types in the file.

**New types to add:**

```typescript
// Stage and source enums
export type LeadStage = "new-enquiry" | "contacted" | "proposal-sent" | "negotiating" | "won" | "lost";
export type LeadSource = "website" | "referral" | "instagram" | "facebook" | "email" | "phone" | "walk-in" | "other";
export type ProposalStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "converted";
export type GuestType = "day" | "evening" | "both";
export type RSVPStatus = "pending" | "confirmed" | "declined" | "maybe";
export type CommDirection = "inbound" | "outbound" | "internal";
export type CommType = "email" | "call" | "note" | "sms" | "whatsapp" | "meeting";
export type PaymentScheduleStatus = "pending" | "paid" | "overdue";
export type FormType = "enquiry" | "rsvp" | "feedback" | "supplier-info" | "custom";
export type FormStatus = "draft" | "published" | "archived";
export type FieldType = "short-text" | "long-text" | "select" | "multi-select" | "date" | "number" | "file-upload" | "section-header";
export type VenueType = "hotel" | "country-house" | "conference" | "outdoor" | "restaurant" | "barn" | "manor" | "other";
export type VenueStatus = "preferred" | "active" | "inactive" | "archived";
export type VenueDocType = "hire-agreement" | "floorplan" | "health-safety" | "insurance" | "capacity-certificate" | "site-map" | "other";

export interface Lead {
  id: string;
  workspace_id: string;
  title: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  company_name: string | null;
  event_type: string | null;
  event_date: string | null;
  event_location: string | null;
  guest_count_estimate: number | null;
  budget_estimate_pence: number | null;
  stage: LeadStage;
  source: LeadSource | null;
  assigned_to: string | null;
  converted_event_id: string | null;
  lost_reason: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  workspace_id: string;
  lead_id: string;
  action: string;
  detail: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface Proposal {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  event_id: string | null;
  title: string;
  client_name: string;
  client_email: string | null;
  event_type: string | null;
  event_date: string | null;
  event_location: string | null;
  guest_count: number | null;
  intro_text: string | null;
  terms_text: string | null;
  status: ProposalStatus;
  valid_until: string | null;
  total_pence: number;
  currency: string;
  signed_by_name: string | null;
  signed_by_email: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  converted_invoice_id: string | null;
  share_token: string | null;
  viewed_at: string | null;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalLineItem {
  id: string;
  proposal_id: string;
  description: string;
  quantity: number;
  unit_price_pence: number;
  total_pence: number;
  sort_order: number;
  created_at: string;
}

export interface EventGuest {
  id: string;
  workspace_id: string;
  event_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  guest_type: GuestType;
  rsvp_status: RSVPStatus;
  meal_choice: string | null;
  dietary_notes: string | null;
  table_number: string | null;
  seat_number: string | null;
  plus_one_name: string | null;
  notes: string | null;
  imported_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Communication {
  id: string;
  workspace_id: string;
  event_id: string | null;
  lead_id: string | null;
  subject: string | null;
  body: string;
  direction: CommDirection;
  comm_type: CommType;
  participant_name: string | null;
  participant_email: string | null;
  participant_phone: string | null;
  thread_id: string | null;
  is_read: boolean;
  attachments: unknown[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoicePaymentSchedule {
  id: string;
  workspace_id: string;
  invoice_id: string;
  label: string;
  amount_pence: number;
  percentage: number | null;
  due_date: string;
  status: PaymentScheduleStatus;
  paid_at: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Form {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  form_type: FormType;
  status: FormStatus;
  share_token: string | null;
  submission_count: number;
  event_id: string | null;
  settings: Record<string, unknown>;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormField {
  id: string;
  form_id: string;
  field_type: FieldType;
  label: string;
  placeholder: string | null;
  options: string[];
  required: boolean;
  sort_order: number;
  settings: Record<string, unknown>;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  workspace_id: string;
  data: Record<string, unknown>;
  submitter_email: string | null;
  submitter_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_lead_id: string | null;
  created_at: string;
}

export interface Venue {
  id: string;
  workspace_id: string;
  name: string;
  venue_type: VenueType | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string;
  capacity_day: number | null;
  capacity_evening: number | null;
  hire_fee_min_pence: number | null;
  hire_fee_max_pence: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  f_and_b_minimum_pence: number | null;
  setup_hours: number | null;
  breakdown_hours: number | null;
  parking_spaces: number | null;
  accessibility_notes: string | null;
  notes: string | null;
  status: VenueStatus;
  cover_path: string | null;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenueDocument {
  id: string;
  workspace_id: string;
  venue_id: string;
  doc_type: VenueDocType;
  filename: string;
  storage_key: string;
  file_size_bytes: number | null;
  expiry_date: string | null;
  status: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface VenueNote {
  id: string;
  workspace_id: string;
  venue_id: string;
  body: string;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

**File to edit:** `src/lib/supabase/types.ts`

---

### Step 3 — StatusBadge New Variants

**What:** Add all new status variants needed by Levels 2–9. Do this once in Level 1 so every feature can use them.

**New variants to add to `src/components/ui/StatusBadge.tsx`:**

```typescript
// Lead stages
| "new-enquiry"    → already exists ✅
| "contacted"      → bg-info-50 text-info-600 border-info-200
| "proposal-sent"  → bg-violet-50 text-violet-600 border-violet-200
| "negotiating"    → bg-warning-50 text-warning-600 border-warning-200
| "won"            → bg-success-50 text-success-700 border-success-200
| "lost"           → bg-surface-100 text-surface-500 border-surface-200

// Proposal status
| "viewed"         → bg-info-50 text-info-600 border-info-200
| "signed"         → bg-success-50 text-success-700 border-success-200
| "declined"       → bg-danger-50 text-danger-600 border-danger-200
| "converted"      → bg-brand-50 text-brand-700 border-brand-200
// "draft", "sent", "expired", "void", "accepted" → already exist ✅

// RSVP
| "confirmed"      → already exists (maps to confirmed) ✅
| "maybe"          → bg-warning-50 text-warning-600 border-warning-200

// Venue
| "preferred"      → already exists ✅

// Schedule
// "pending", "paid", "overdue" → already exist ✅

// Forms
| "published"      → bg-success-50 text-success-700 border-success-200
// "draft", "archived" → already exist ✅
```

**File to edit:** `src/components/ui/StatusBadge.tsx`

---

### Step 4 — Shared UI Primitives Check

**What:** Before building 9 levels of features, verify which shared components are needed and which already exist. Build any new ones here so they're available globally.

**Already exists — use as-is:**
- `PageHeader` (`src/components/ui/PageHeader.tsx`) — title + breadcrumb + actions slot
- `MetricCard` (`src/components/ui/MetricCard.tsx`) — KPI cards
- `EmptyState` (`src/components/ui/EmptyState.tsx`) — empty states
- `TabNav` (`src/components/ui/TabNav.tsx`) — tab navigation
- `WizardStepper` (`src/components/ui/WizardStepper.tsx`) — multi-step wizard progress
- `StatusBadge` — updated in Step 3
- `SectionShell` (`src/components/ui/SectionShell.tsx`)

**New primitive needed — `KanbanBoard`:**  
Reusable Kanban component for Leads pipeline (Level 2). Accepts columns array + items array + `onDrop` callback. Pure React drag-and-drop using HTML5 `draggable` attribute — no library needed.

```typescript
// src/components/ui/KanbanBoard.tsx
// Props:
interface KanbanBoardProps<T> {
  columns: { id: string; label: string; color: string }[];
  items: T[];
  getItemColumnId: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onMoveItem?: (itemId: string, toColumnId: string) => void;
}
```

**New primitive needed — `CSSBarChart`:**  
Reusable horizontal/vertical bar chart using only CSS flexbox and percentages. No external library. Used by Reports (Level 5).

```typescript
// src/components/ui/CSSBarChart.tsx
// Props:
interface CSSBarChartProps {
  data: { label: string; value: number; color?: string }[];
  maxValue?: number;  // auto-calculated if omitted
  height?: number;
  showValues?: boolean;
  orientation?: "vertical" | "horizontal";
}
```

**File locations:** `src/components/ui/KanbanBoard.tsx`, `src/components/ui/CSSBarChart.tsx`

---

### Step 5 — Navigation Update (AppSidebar + proxy.ts)

**What:** Expand the sidebar to include the 3 new top-level sections: Leads, Venues, Inbox. Add all new routes to the public prefix exceptions in `proxy.ts`.

**`src/components/layout/AppSidebar.tsx` — updated NAV_ITEMS:**

```typescript
import {
  LayoutDashboard,
  CalendarDays,
  Users2,
  Building2,         // new — Venues
  CheckSquare,
  Banknote,
  MessageSquare,     // new — Inbox
  FolderOpen,
  Settings2,
  ChevronRight,
  Megaphone,         // new — Leads
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/app/home",      label: "Home",      icon: LayoutDashboard },
  { href: "/app/leads",     label: "Leads",     icon: Megaphone },       // NEW
  { href: "/app/events",    label: "Events",    icon: CalendarDays },
  { href: "/app/venues",    label: "Venues",    icon: Building2 },       // NEW
  { href: "/app/suppliers", label: "Suppliers", icon: Users2 },
  { href: "/app/tasks",     label: "Tasks",     icon: CheckSquare },
  { href: "/app/finance",   label: "Finance",   icon: Banknote },
  { href: "/app/inbox",     label: "Inbox",     icon: MessageSquare },   // NEW
  { href: "/app/library",   label: "Library",   icon: FolderOpen },
  { href: "/app/settings",  label: "Settings",  icon: Settings2 },
];
```

**`src/proxy.ts` — no change needed.** The existing PUBLIC_PREFIXES already covers `/portal` (client portal will be at `/portal/[token]`). Public form fill at `/f/[token]` needs to be added:

```typescript
const PUBLIC_PREFIXES = [
  "/", "/login", "/signup", "/forgot-password", "/reset-password",
  "/verify-email", "/accept-invite", "/pricing", "/features",
  "/security", "/contact", "/book-demo", "/product", "/onboarding",
  "/_next", "/api",
  "/portal",   // client portal — public token-based
  "/f",        // public form fill pages
  "/p",        // public proposal sign pages
];
```

**Note on Reports:** Reports is accessible via the Finance section or as a `/app/reports` route linked from the Finance page header — it does NOT appear in the sidebar per the AGENTS.md constraint.

---

### Step 6 — Route Scaffolding (empty pages, no dead code)

**What:** Create all new route files as minimal valid pages before filling them out in subsequent levels. This ensures the build compiles throughout the entire plan — no level introduces a route that breaks the previous compile state.

**Create empty-but-valid pages for:**

```
src/app/(app)/leads/page.tsx
src/app/(app)/leads/new/page.tsx
src/app/(app)/leads/[leadId]/page.tsx
src/app/(app)/proposals/page.tsx
src/app/(app)/proposals/new/page.tsx
src/app/(app)/proposals/[proposalId]/page.tsx
src/app/(app)/reports/page.tsx
src/app/(app)/inbox/page.tsx
src/app/(app)/inbox/[threadId]/page.tsx
src/app/(app)/forms/page.tsx
src/app/(app)/forms/new/page.tsx
src/app/(app)/forms/[formId]/page.tsx
src/app/(app)/venues/page.tsx
src/app/(app)/venues/new/page.tsx
src/app/(app)/venues/[venueId]/page.tsx

// Public routes (outside (app) group)
src/app/portal/[token]/page.tsx
src/app/f/[formToken]/page.tsx
src/app/p/[proposalToken]/page.tsx
```

Each scaffold page template (no imports needed at scaffold stage):
```typescript
export default function PageNamePage() {
  return <div>Loading…</div>;
}
```

**Run `npm run build` after Step 6.** The build must remain clean before Level 2 begins.

---

## LEVEL 2 — LEADS / ENQUIRY CRM

*Target: Full pipeline from first contact to won/lost. Kanban + table. Convert to event.*

---

### Step 7 — Leads Register Page (`/app/leads`)

**File:** `src/app/(app)/leads/page.tsx`

**Layout:** PageHeader ("Leads") + KPI strip (4 cards) + view toggle (Table / Kanban) + table/board

**KPI cards:**
- Total Leads (count, all non-deleted)
- This Month (new leads in current calendar month)
- In Pipeline (count where stage NOT IN won/lost)
- Conversion Rate (won ÷ (won + lost) × 100, formatted as %)

**Table view columns:**
Lead title | Client name | Event type | Event date | Budget | Stage (StatusBadge) | Source | Assigned to | Created date | Actions (View, ...)

**Table filters:**
- Stage filter: All / New Enquiry / Contacted / Proposal Sent / Negotiating / Won / Lost
- Source filter: All sources
- Search: by title or client name

**Seed data (realistic):**
```
1. Carter Wedding — follow-up    | Sarah Carter       | Wedding     | 14 Sep 2026 | £8,500   | contacted      | website
2. Avery Pharma Annual Dinner    | James Avery         | Corporate   | 22 Nov 2026 | £22,000  | proposal-sent  | referral
3. Bristol Charity Gala          | Hannah Rhodes       | Charity     | 05 Feb 2027 | £14,000  | new-enquiry    | instagram
4. Morrison Wedding               | Tom Morrison        | Wedding     | 01 Aug 2026 | £6,200   | won            | referral
5. Tech Summit 2027              | Lena Park           | Conference  | 10 Mar 2027 | £35,000  | negotiating    | email
6. Bellingham Birthday Party     | David Bellingham    | Private     | 19 Jul 2026 | £3,800   | lost           | phone
```

**Button wiring:**
- "New Lead" button → navigates to `/app/leads/new`
- Row click → navigates to `/app/leads/[leadId]`
- View toggle → switches between table and kanban (client state, no route change)

---

### Step 8 — Leads Kanban Board

**What:** Second view mode on the same `/app/leads` page. Toggle via button in the page header actions area (Table icon / Kanban icon buttons).

**Uses:** The `KanbanBoard` primitive from Step 4.

**Columns (in order):**
New Enquiry (info/blue) → Contacted (violet) → Proposal Sent (brand) → Negotiating (warning/amber) → Won (success/green) → Lost (surface/grey)

**Card layout:**
- Lead title (bold)
- Client name (small)
- Event type + Event date
- Budget (if set)
- StatusBadge for current stage
- Source tag

**Drag behaviour:** `draggable` HTML attribute + `ondragover`/`ondrop` handlers. On drop, call `onMoveItem` which fires a Supabase `update` to change `stage`. Optimistic UI update — revert on error.

**Empty state per column:** "No leads in this stage" (3-line text, no icon needed for columns)

---

### Step 9 — New Lead Form (`/app/leads/new`)

**File:** `src/app/(app)/leads/new/page.tsx`

**Layout:** Single-page form (no wizard stepper needed — not complex enough) with two columns on desktop (1 on mobile).

**Fields:**

*Enquiry Details section*
- Lead Title * (text, e.g. "Carter Wedding Sept 2026")
- Client Name * (text)
- Client Email (email)
- Client Phone (tel)
- Company / Organisation (text, optional)

*Event Details section*
- Event Type (select: Wedding / Corporate / Charity / Private / Conference / Exhibition / Other)
- Estimated Event Date (date)
- Location / Venue (text — free text at this stage, not CRM linked yet)
- Estimated Guest Count (number)
- Budget Estimate (number, labelled £ GBP)

*Pipeline section*
- Stage (select, default: New Enquiry)
- Source (select: Website / Referral / Instagram / Facebook / Email / Phone / Walk-in / Other)
- Assigned To (select from workspace team members)

*Notes section*
- Initial Notes (textarea)

**Buttons:**
- "Save Lead" → INSERT to `leads` → redirect to `/app/leads/[newId]`
- "Cancel" → navigate back to `/app/leads`

---

### Step 10 — Lead Detail Page (`/app/leads/[leadId]`)

**File:** `src/app/(app)/leads/[leadId]/page.tsx`

**Layout:** PageHeader (lead title + client name) + stage progress bar + 3-column grid on desktop (main content, right rail)

**Stage progress bar:** Horizontal pill bar showing 6 stages. Current stage highlighted with brand colour. Clicking a stage opens a confirm popover ("Move to Contacted?") then updates.

**Left/Main — 2 tabs:**

*Overview tab:*
- Lead info card (all fields from the form, inline edit button)
- Budget card with formatted value
- Quick actions: "Create Proposal" (→ new proposal pre-filled) | "Convert to Event" (Step 12) | "Mark Won" | "Mark Lost"

*Activity tab:*
- Timeline of all `lead_activities` records for this lead
- Log types with icons: stage change, note added, proposal created, email logged, call logged
- "Add Note" button → inline form → INSERT to `lead_activities`

**Right rail:**
- Linked Proposal (if any) — card with status badge + "View Proposal" link
- Linked Event (if converted) — card with status + "View Event" link
- Quick log buttons: "Log Call" | "Log Email" | "Log Note"

**Header actions:**
- "Edit" button → inline edit mode on the info card
- "..." overflow: Archive Lead, Delete Lead (confirmation required)

---

### Step 11 — Lead Activity + Stage Change Logging

**What:** Every action on a lead writes a `lead_activities` row. This is the audit trail and the "what happened" history.

**Actions that auto-log:**
| User Action | Activity Text |
|---|---|
| Lead created | "Lead created from [source]" |
| Stage changed | "Stage changed from [old] to [new]" |
| Note added | "Note added: [first 100 chars]" |
| Proposal created | "Proposal '[title]' created and linked" |
| Call logged | "Call logged with [participant_name]" |
| Email logged | "Email logged: [subject]" |
| Assigned to changed | "Assigned to [name]" |
| Lead converted | "Converted to event: [event title]" |
| Lead won/lost | "Marked as [Won/Lost]. Reason: [text]" |

**Implementation:** Each mutation function (updateLeadStage, createLeadNote, etc.) also inserts into `lead_activities` in the same Supabase transaction or immediate follow-up call.

---

### Step 12 — Convert Lead to Event

**What:** The "Convert to Event" button on the lead detail page opens a confirmation modal and creates a new event pre-filled with the lead data. This is the critical handoff between pre-sales and delivery.

**Convert modal fields:**
- Event Title (pre-filled from lead title)
- Event Date (pre-filled from lead event_date)
- Client Name (pre-filled)
- Event Type (pre-filled)
- Venue (pre-filled from lead location)

**On confirm:**
1. INSERT to `events` with pre-filled data
2. UPDATE `leads` SET `stage = 'won'`, `converted_event_id = [new event id]`
3. INSERT to `lead_activities`: "Converted to event: [event title]"
4. Navigate to the new event detail page `/app/events/[newEventId]`

**Post-conversion:** Lead detail shows a "Converted" banner and a card linking to the event. The lead is no longer editable for stage (it's won).

---

## LEVEL 3 — PROPOSALS + E-SIGNATURE

*Target: Full proposal lifecycle from draft to signed. UK-legal e-sign with zero API cost.*

---

### Step 13 — Proposals Register (`/app/proposals`)

**File:** `src/app/(app)/proposals/page.tsx`

**Layout:** PageHeader ("Proposals") + KPI strip + table

**KPI cards:**
- Total Proposals (count)
- Awaiting Signature (status = sent or viewed)
- Total Value (sum of total_pence formatted as £)
- Conversion Rate (signed ÷ sent × 100%)

**Table columns:**
Title | Client | Event date | Value (£) | Status (StatusBadge) | Valid until | Sent date | Actions

**Filters:** Status filter (All / Draft / Sent / Viewed / Signed / Declined / Converted)

**Seed data (6 proposals):**
```
1. Carter Wedding Proposal 2026       | Sarah Carter     | 14 Sep 2026 | £8,200  | signed    | –          | 01 Jun 2026
2. Avery Pharma Annual Dinner         | James Avery      | 22 Nov 2026 | £21,500 | sent      | 30 Jun 2026| 08 Jun 2026
3. Bristol Charity Gala Proposal      | Hannah Rhodes    | 05 Feb 2027 | £13,800 | viewed    | 20 Jun 2026| 10 Jun 2026
4. Tech Summit 2027 Proposal          | Lena Park        | 10 Mar 2027 | £34,000 | draft     | –          | –
5. Morrison Wedding                    | Tom Morrison     | 01 Aug 2026 | £6,100  | converted | –          | 15 May 2026
6. Bellingham Birthday                | David Bellingham | 19 Jul 2026 | £3,600  | declined  | –          | 22 May 2026
```

---

### Step 14 — New Proposal Wizard (`/app/proposals/new`)

**File:** `src/app/(app)/proposals/new/page.tsx`

**Uses:** `WizardStepper` component (4 steps)

**Step 1 — Details:**
- Proposal Title * (text)
- Client Name * (text)
- Client Email (email)
- Event Type (select)
- Event Date (date)
- Event Location (text)
- Guest Count (number)
- Valid Until (date — default: today + 14 days)
- Optional: "Link to Lead" select (searchable dropdown of existing leads)

**Step 2 — Services & Pricing:**
- Line items table with Add/Remove rows
- Each row: Description, Quantity, Unit Price (£), Total (auto-calculated)
- Running total at bottom
- Optional: Deposit percentage slider (0–100%) showing deposit amount
- Note: "Prices are inclusive of VAT unless stated otherwise" editable checkbox

**Step 3 — Terms & Introduction:**
- Introduction text (textarea, shown at top of proposal PDF view) — placeholder: "Thank you for considering Gala Dock for your event. We are delighted to present the following proposal..."
- Terms & Conditions (textarea) — default terms template: "This proposal is valid for 14 days. A 33% deposit is required to confirm the booking. The remaining balance is due 14 days before the event date..."

**Step 4 — Preview:**
- Full-width rendered proposal document view (same as the public signing page)
- "Save as Draft" button
- "Send to Client" button (sets status = 'sent', generates share_token, copies link to clipboard)

---

### Step 15 — Proposal Detail (`/app/proposals/[proposalId]`)

**File:** `src/app/(app)/proposals/[proposalId]/page.tsx`

**Layout:** PageHeader (proposal title + client name + status badge) + main document view + right rail

**Main area — proposal document view:**
- Rendered proposal exactly as the client sees it (same component used in Step 16 signing page)
- Gala Dock branding header + workspace name
- Client name + event details
- Introduction text
- Line items table
- Total + deposit calculation
- Terms & Conditions
- Signature section (shows "Signed by [name] on [date]" if signed, or "Awaiting signature" if pending)

**Right rail:**
- Status card (current status + dates: created, sent, viewed, signed)
- Actions:
  - "Copy Client Link" (copies `/p/[share_token]` to clipboard) — shown when status ≠ draft
  - "Send to Client" button (sets status = sent, generates token if not set) — shown when draft
  - "Convert to Invoice" button (Step 18) — shown when signed
  - "Edit" button — shown when draft only
  - "Duplicate" button
- Activity timeline (all proposal events)

**Header actions:** Edit (draft only), Download PDF (print-optimised CSS), Duplicate, Delete

---

### Step 16 — E-Signature Flow (Public Signing Page)

**File:** `src/app/p/[proposalToken]/page.tsx`  
**Route group:** Outside `(app)` — public route, no auth required

**What this page does:** The client opens this URL from their email. They see the full proposal. At the bottom is the signature section.

**Page layout (no sidebar, clean white):**
- Gala Dock logo top-left (small)
- Full proposal document (read-only)
- Signature section at bottom:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SIGN THIS PROPOSAL

  [ ] I have read and agree to the terms and conditions set out in this proposal.

  Full Name: [___________________________]

  [  Sign & Accept Proposal  ]

  By signing, you agree to the terms above. This constitutes a legally binding
  agreement under UK contract law. Signed on: [date will be recorded here]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**On click "Sign & Accept Proposal":**
1. Validate: checkbox must be checked, name must be filled
2. UPDATE `proposals` SET `status = 'signed'`, `signed_by_name = [name]`, `signed_at = now()`, `signed_ip = [client IP from request headers]`
3. Show confirmation screen: "Thank you, [name]. This proposal has been signed and your event planner has been notified. Signed on [date] at [time]."

**Legal note:** Under the Electronic Communications Act 2000 (UK), a typed name + checkbox is a valid electronic signature for commercial contracts. No DocuSign, HelloSign, or Adobe Sign API required.

**Error states:** Proposal not found / expired / already signed / declined — each shows an appropriate message.

---

### Step 17 — Proposal Status State Machine

**What:** Define all allowed status transitions and block invalid ones.

```
draft → sent (planner sends)
draft → deleted (planner deletes)
sent → viewed (client opens the public link — auto-update on page load)
sent → declined (client declines on signing page)
sent → expired (valid_until date passes)
viewed → signed (client signs)
viewed → declined (client declines)
viewed → expired (valid_until date passes)
signed → converted (planner converts to invoice)
declined → draft (planner revises and resets)
expired → draft (planner revises)
converted → [terminal, no further changes]
```

**Implementation:** `updateProposalStatus(proposalId, newStatus)` helper in `src/lib/proposals.ts` that:
1. Checks the transition is valid
2. Updates the row
3. Logs to an activity record (inline in proposals table via jsonb activity array, or separate activity table if preferred)

---

### Step 18 — Proposal to Invoice Conversion

**What:** One click on the signed proposal creates a draft invoice pre-filled with all line items.

**"Convert to Invoice" button behaviour (right rail of proposal detail):**
1. Reads all `proposal_line_items` for this proposal
2. Creates a new `invoices` row with:
   - client_name from proposal
   - event_id from linked event (if any)
   - status = 'draft'
   - total_pence = proposal total_pence
3. Creates `invoice_line_items` rows mirroring the proposal line items
4. Updates `proposals` SET `status = 'converted'`, `converted_invoice_id = [new invoice id]`
5. Navigates to the new invoice detail page `/app/finance/invoices/[newInvoiceId]`

**Guard:** Button only visible when `status === 'signed'`. If already converted, shows "Converted → View Invoice" link instead.

---

## LEVEL 4 — GUEST MANAGEMENT

*Target: Full guest register per event with RSVP, meal choices, dietary flags, CSV import.*

---

### Step 19 — Event Guests Tab (Tab 9 in Event Detail)

**File:** `src/app/(app)/events/[eventId]/page.tsx`

**What:** Add "Guests" as the 9th tab in the event detail TABS array.

**TABS array update:**
```typescript
const TABS = [
  { id: "overview" },
  { id: "brief" },
  { id: "suppliers", count: 2, badge: "warning" },
  { id: "tasks", count: 2, badge: "danger" },
  { id: "runsheet" },
  { id: "finance" },
  { id: "files", count: 5 },
  { id: "guests" },   // NEW — tab 9
  { id: "activity" },
];
```

**Tab label:** "Guests" — badge shows confirmed guest count when data is loaded.

---

### Step 20 — Guest Register UI (within Guests tab)

**What:** Full guest table within the Guests tab of event detail.

**KPI strip (4 cards at top of tab):**
- Total Guests (count all event_guests for this event)
- Confirmed (rsvp_status = 'confirmed')
- Pending (rsvp_status = 'pending')
- Declined (rsvp_status = 'declined')

**Table columns:**
Name (first + last) | Email | Guest Type (Day/Evening/Both) | RSVP (StatusBadge) | Meal Choice | Dietary Notes | Table | Plus One | Actions (Edit, Remove)

**Filters:** Guest Type (All/Day/Evening/Both) | RSVP Status (All/Confirmed/Pending/Declined/Maybe)

**Actions in header:**
- "Add Guest" button → opens inline slide-up form (not a separate page — guests are added inline)
- "Import CSV" button → opens file picker for CSV import (Step 22)
- "Export CSV" button → downloads current guest list as CSV

**Seed data (for Carter Wedding event):**
```
1. Sarah Carter     | sarah@carter.co.uk   | Both    | confirmed | Beef      | None        | 1
2. James Carter     | –                    | Both    | confirmed | Vegetarian| Gluten-free | 1
3. Margaret Wells   | –                    | Day     | confirmed | Chicken   | None        | 2
4. Tom Rhodes       | tom@rhodes.com       | Evening | pending   | –         | –           | –
5. Lisa Park        | lisa@park.co.uk      | Both    | confirmed | Fish      | Shellfish   | 2
6. Alex Burns       | –                    | Day     | declined  | –         | –           | –
7. Nina Costa       | nina@costa.co.uk     | Both    | pending   | –         | Nut allergy | 3
8. Paul Wright      | –                    | Evening | confirmed | Beef      | None        | –
```

---

### Step 21 — Guest Add / Edit Form

**What:** The inline form (slide-up panel or right-side drawer) for adding and editing individual guests.

**Form fields:**
- First Name * (text)
- Last Name * (text)
- Email (email, optional)
- Phone (tel, optional)
- Guest Type * (select: Day / Evening / Both)
- RSVP Status * (select: Pending / Confirmed / Declined / Maybe, default: Pending)
- Meal Choice (text or select if event has set meal options)
- Dietary Notes (text, e.g. "Nut allergy, vegan")
- Table Number (text)
- Seat Number (text)
- Plus One Name (text)
- Notes (textarea)

**Buttons:**
- "Save Guest" → INSERT or UPDATE → refreshes guest list, closes form
- "Cancel" → closes form without saving

---

### Step 22 — CSV Import for Guests

**What:** Upload a CSV file to batch-import guests. The importer shows a preview and handles validation.

**UI flow:**
1. Click "Import CSV" → opens a modal
2. Modal shows: upload area (`<label><input type="file" accept=".csv" className="hidden" /></label>`) + download template button
3. On file select → parse CSV in browser (no API needed, use `FileReader` + manual CSV split)
4. Show preview table: first 10 rows, columns mapped, validation errors highlighted
5. Column mapping: First Name, Last Name, Email, Guest Type, RSVP Status, Meal Choice, Dietary Notes
6. "Import [N] Guests" → batch INSERT to `event_guests`

**CSV template columns:** `First Name,Last Name,Email,Guest Type,RSVP Status,Meal Choice,Dietary Notes`

**Validation:** Skip rows with blank First Name + Last Name. Log skipped rows. Show import summary: "[N] guests imported, [M] rows skipped."

**Meal choice summary section below the table:**
A small card showing: Total Confirmed | Beef: X | Chicken: X | Fish: X | Vegetarian: X | Other/Special: X. This is the BEO catering input.

---

## LEVEL 5 — REPORTS & ANALYTICS

*Target: 6-tab reports section. Pure CSS charts. No chart library. Drives renewal and upsell.*

---

### Step 23 — Reports Route + Overview Tab

**File:** `src/app/(app)/reports/page.tsx`

**Navigation:** Accessible from `/app/reports`. Linked from Finance page header as "View Reports" button. Does NOT appear in main sidebar (per AGENTS.md constraint).

**Page layout:** PageHeader ("Reports & Analytics") + 6-tab TabNav + tab content

**Tabs:** Overview | Revenue | Events | Suppliers | Team | Clients

**Overview tab layout:**

*Top KPI row (5 cards):*
- Total Revenue YTD (£, from paid invoices)
- Events Delivered YTD (count, status = completed)
- Active Events (status = confirmed or in-delivery)
- New Leads This Month (count)
- Pipeline Value (sum of budget_estimate_pence for non-won/lost leads, formatted as £)

*Revenue Trend (12-month CSS bar chart):*
- Title: "Revenue — Last 12 Months"
- Vertical CSS bars, one per month (Jan–Dec 2026)
- Bar height = proportional to that month's paid invoices total
- Hover tooltip showing month + value
- Uses `CSSBarChart` component from Step 4

*Pipeline Funnel (horizontal CSS bars):*
- Title: "Lead Pipeline"
- 6 rows (one per stage)
- Each row: stage name | count badge | horizontal bar (width proportional to count)
- New Enquiry: 2 | Contacted: 1 | Proposal Sent: 2 | Negotiating: 1 | Won: 1 | Lost: 1

*Quick insights row (3 cards):*
- "Avg days lead to event conversion: 23 days"
- "Most booked event type: Wedding (4)"
- "Top supplier by events: Noble Kitchen Co."

---

### Step 24 — Revenue Tab

**What:** Deep-dive into financial performance.

**Sections:**

*Monthly invoiced vs paid (dual-bar CSS chart):*
- Two bars per month: Invoiced (brand colour) + Paid (success colour)
- 12 months
- Legend

*Revenue by event type (horizontal bar CSS chart):*
- Wedding: £42,300 | Corporate: £35,100 | Charity: £18,400 | Private: £8,200 | Conference: £11,000

*Outstanding summary card:*
- Outstanding: £18,200 | Overdue: £3,400 | Due this month: £8,600

*Invoice status distribution (pill/donut alternative using CSS):*
- Paid: 58% | Sent: 24% | Overdue: 8% | Draft: 10%
- Implemented as a horizontal stacked bar in CSS with colour segments

*Top 5 clients by revenue table:*
Client name | Events | Total Billed | Total Paid | Outstanding

---

### Step 25 — Events Tab

**What:** Event delivery scorecard.

**Sections:**

*Event status distribution (CSS horizontal bar):*
- Confirmed: X | In Delivery: X | Completed: X | Cancelled: X

*Events by type this year (CSS vertical bars):*
- Wedding | Corporate | Charity | Private | Conference

*Event delivery table:*
Event name | Date | Type | Status | Guests | Revenue | Margin% | Completion

*Average event margin:*
Large KPI card — "Avg Gross Margin: 34%" + sub-text "Across 8 delivered events"

*Upcoming events timeline (simple list):*
Next 5 events — name, date, status badge, days until

---

### Step 26 — Suppliers Tab

**What:** Supplier performance and spend tracking.

**Sections:**

*Spend by supplier category (horizontal bar chart):*
Catering | AV & Tech | Floristry | Photography | Entertainment | Staffing

*Top suppliers by booking count:*
Table — Supplier | Category | Bookings | Total Spend (£) | Avg Quote (£) | Doc Health

*Supplier document health summary:*
- Verified: X | Expiring (30 days): X | Missing: X | Expired: X
- Links to Suppliers section filtered by health

*Quote acceptance rate:*
"Quotes sent: 24 | Accepted: 18 | Declined: 3 | Pending: 3 | Acceptance rate: 75%"

---

### Step 27 — Team Tab

**What:** Team workload and task performance.

**Sections:**

*Tasks by status (CSS bar chart):*
Not Started | In Progress | Completed | Overdue

*Tasks by team member (horizontal bar):*
Each team member — name | tasks assigned | completed | overdue count

*Overdue tasks alert card:*
"[N] tasks overdue. [View overdue tasks]" link → navigates to `/app/tasks` with overdue filter

*Events per team member:*
"Events assigned" count per member

*Note: This tab uses seed data until real team user data is wired.*

---

### Step 28 — Clients Tab

**What:** Client retention and repeat booking analysis.

**Sections:**

*Client summary table:*
Client name | Events | First event | Last event | Total spent | Status (active/inactive)

*Retention KPI cards:*
- Total Clients: 14
- Repeat Clients: 6 (43%)
- Avg Events per Client: 1.8
- Avg Client Value: £9,300

*Upcoming renewals list:*
Clients whose last event was 9–12 months ago — "due for re-engagement"
Table: Client | Last event date | Events count | Total spend | Action: "Create Lead"

*Note: This tab seeds realistic data. Live wiring requires joining leads + events on client_name or a future contacts table.*

---

## LEVEL 6 — COMMUNICATION INBOX

*Target: In-app comms log. No external email API required. Thread view + event-linked.*

---

### Step 29 — Communications Table + Types

Already covered in Step 1 (DB) and Step 2 (types). This step is the seed data definition.

**Seed data for Carter Wedding event threads:**
```
Thread 1 — Client: Sarah Carter
  [outbound/email] "Carter Wedding — Initial Proposal Sent" | Jun 1 2026
  [inbound/email]  "Re: Carter Wedding Proposal" — "Thank you, looks great!" | Jun 2 2026
  [outbound/email] "Carter Wedding — Confirmation & Next Steps" | Jun 3 2026

Thread 2 — Supplier: Noble Kitchen Co.
  [outbound/email] "Catering Quote Request — Carter Wedding" | May 28 2026
  [inbound/email]  "Re: Catering Quote" — "Please find attached our quote..." | May 30 2026
  [internal/note]  "Agreed to £4,200 all-in. Confirm by phone." | Jun 1 2026

Thread 3 — General note
  [internal/note]  "Venue confirmed setup window 08:00–12:00. Brief catering team." | Jun 4 2026
```

---

### Step 30 — Inbox Hub (`/app/inbox`)

**File:** `src/app/(app)/inbox/page.tsx`

**Layout:** Two-column layout on desktop (list left, thread right). Full list on mobile (tap to open thread).

**Left panel — conversation list:**
- Search bar (filter by participant name or subject)
- Filter tabs: All | Unread | Client | Supplier | Internal
- Each row: participant name + event name + last message preview + timestamp + unread dot

**Right panel (default state):**
- "Select a conversation to view it" empty state

**"New Message" button in header:** Opens compose modal

**Unread count:** Badge on the Inbox sidebar item (shows total unread `is_read = false` count)

---

### Step 31 — Thread View (`/app/inbox/[threadId]`)

**File:** `src/app/(app)/inbox/[threadId]/page.tsx`

**Layout:** Thread header (participant name + event link + comm type) + message list (chronological) + compose area

**Message bubble layout:**
- Outbound: right-aligned, brand colour background
- Inbound: left-aligned, surface-50 background
- Internal note: full-width, amber/warning-50 background, "Internal Note" label

**Each message shows:**
- Sender name + comm type icon (Mail/Phone/StickyNote/MessageCircle)
- Timestamp
- Body text
- Attachments (file pills if any)

**Compose area (bottom of thread):**
- Textarea ("Write a message or note...")
- Comm type selector: Email | Call log | Note | SMS (greyed/locked for SMS — "Coming in V2")
- Attach file button: `<label><input type="file" className="hidden" /></label>`
- Send button

**"Mark all as read" button in thread header**

---

### Step 32 — Comms Tab in Event Detail

**What:** Add a "Comms" tab to the event detail page. This shows all `communications` where `event_id = [current event id]`, grouped by thread.

**Event detail tab addition:**

```typescript
// Add to the TABS array in src/app/(app)/events/[eventId]/page.tsx
{ id: "comms", label: "Comms" }
```

**Tab content layout:**
- Thread list (same style as inbox left panel but filtered to this event)
- Click a thread → navigate to `/app/inbox/[threadId]`
- "New Message" button → compose modal pre-filled with this event

**Quick log section:**
Three buttons in a row: "Log Call" | "Log Email" | "Add Note"
Each opens a compact modal:
- Log Call: participant name, phone, duration (optional), notes, date/time
- Log Email: participant name, email, subject, summary
- Add Note: internal note text

All three insert to `communications` with `event_id = [current event]` and appropriate `comm_type`.

---

### Step 33 — Inbox Read State + Unread Badge

**What:** Track which communications are unread and surface the count in the sidebar badge.

**Sidebar badge:** The Inbox nav item shows a small red badge with the unread count when `count > 0`. Uses a server component or client-side Supabase query to count `is_read = false` records.

**Mark as read:** When a thread is opened, all messages in that thread are updated: `is_read = true`. This fires on thread mount.

**Implementation:** Supabase realtime subscription on `communications` table for the current workspace — when a new inbound communication is inserted, the inbox badge increments. For V1 this is a page-load count query; realtime subscription is a V1.5 enhancement.

---

## LEVEL 7 — FINANCE ENHANCEMENTS

*Target: Payment schedules inside invoice detail. BEO export. Stripe link UI stub (no mandatory Stripe cost).*

---

### Step 34 — Invoice Payment Schedules (DB + Types)

Already covered in Step 1 (DB) and Step 2 (types). This step defines the seed data for the Carter Wedding invoice.

**Seed schedule for Invoice INV-001 (Carter Wedding, total £8,200):**
```
1. Deposit (33%)       | £2,706 | Due: 15 Jun 2026 | status: paid   | paid_at: 15 Jun 2026
2. Interim Payment     | £2,747 | Due: 14 Aug 2026 | status: pending
3. Final Balance (34%) | £2,747 | Due: 07 Sep 2026 | status: pending
```

---

### Step 35 — Payment Schedule Tab in Invoice Detail

**File:** `src/app/(app)/finance/invoices/[invoiceId]/page.tsx`

**What:** Add a "Schedule" tab to the invoice detail page (alongside the existing tabs).

**Tab layout:**

*Header section:*
- Progress bar: paid segments (green) vs pending (surface) vs overdue (red)
- E.g. "1 of 3 payments made — £2,706 of £8,200 (33%)"

*Schedule table:*
| # | Label | Amount | Due Date | Status | Actions |
|---|---|---|---|---|---|
| 1 | Deposit | £2,706 | 15 Jun 2026 | ✅ Paid (15 Jun) | — |
| 2 | Interim Payment | £2,747 | 14 Aug 2026 | ⏳ Pending | [Mark Paid] [Send Reminder] |
| 3 | Final Balance | £2,747 | 07 Sep 2026 | ⏳ Pending | [Mark Paid] [Send Reminder] |

*"Add Payment Milestone" button:* Opens inline form to add a new schedule row.
- Label, Amount (£) or Percentage (%), Due Date

*"Set up Schedule" button (shown when no schedule exists):*  
Opens a modal with preset templates:
- **33% Deposit / 33% Interim / 34% Balance** (most common)
- **50% Now / 50% Balance**
- **100% Upfront**
- **Custom (enter milestones manually)**

*"Mark Paid" action:* Sets status = 'paid', records paid_at = now(). Shows confirmation inline.

*"Send Reminder" action:* In V1 — copies a reminder message template to clipboard ("Send this to your client via email or your preferred channel"). In V2 — sends via Resend/email API when configured.

---

### Step 36 — Payment Schedule Progress Logic

**What:** The invoice detail overview section should show payment schedule progress when a schedule exists.

**Invoice detail overview additions:**
- If `invoice_payment_schedules` rows exist for this invoice → show a "Payment Schedule" card in the overview section
- Card shows: X/Y payments received, total paid, next payment due (date + amount), progress bar

**Overdue detection:** A payment is overdue if `due_date < today` AND `status = 'pending'`. Run this check on page load and show an "Overdue" badge on the relevant row.

---

### Step 37 — BEO Export (Functional)

**File:** `src/app/(app)/events/[eventId]/export/page.tsx`

**What:** Make the existing export stub at `/events/[eventId]/export` generate a real Banquet Event Order document. Print-optimised CSS, no library needed.

**BEO document sections (assembled from existing event data):**

1. **Header:** Gala Dock logo, "BANQUET EVENT ORDER", workspace name, generated date
2. **Event Overview:** Name, Date, Time, Venue (name + address), Client, Event Manager, Event Type
3. **Guest Summary:** Total confirmed guests, Day guests, Evening guests, Plus ones
4. **Catering Summary** (from event brief data + guest meal choices):
   - Beef: X | Chicken: X | Fish: X | Vegetarian: X | Vegan: X | Other: X
   - Dietary requirements list (all unique dietary notes)
   - F&B minimum (if venue CRM linked)
5. **Supplier Contacts:** Table — Supplier name | Category | Contact | Phone | Email | Confirmed status
6. **Run Sheet Summary:** All run sheet items, chronological (from existing run sheet data)
7. **Key Contacts:** Event manager, client primary contact, venue contact
8. **Notes / Special Requirements:** From event brief notes field

**Print functionality:** `<button onClick={() => window.print()}>Print / Save PDF</button>` — uses `@media print` CSS to hide the sidebar/nav and show only the document.

**The page is the document.** No PDF generation library. Fully printable via browser print → Save as PDF.

---

### Step 38 — Stripe Payment Link UI Stub

**What:** Add the payment link UI to the invoice detail page. The schema already has `stripe_payment_link_url`. This step builds the UI. Activation requires Stripe keys in `.env` — no cost until actually activated.

**Invoice detail — new "Online Payment" section:**

When `stripe_payment_link_url` is null:
```
┌─────────────────────────────────────────────────────────────┐
│ 🔗 Online Payment Link                                       │
│                                                             │
│ Generate a Stripe payment link so your client can pay       │
│ online by card.                                             │
│                                                             │
│ [Generate Payment Link]                                     │
│                                                             │
│ ⚠ Requires Stripe to be configured in Settings → Finance   │
└─────────────────────────────────────────────────────────────┘
```

When `stripe_payment_link_url` is set:
```
┌─────────────────────────────────────────────────────────────┐
│ 🔗 Online Payment Link        [Copy Link] [Revoke]          │
│                                                             │
│ https://buy.stripe.com/test_xxx...                         │
│                                                             │
│ Share this link with your client. Payments go directly     │
│ to your Stripe account.                                    │
└─────────────────────────────────────────────────────────────┘
```

**"Generate Payment Link" button:**  
Calls `POST /api/stripe/payment-link` server route. If Stripe is not configured (env vars missing), returns a `402` with "Stripe not configured" error. The UI shows the error inline. No crash.

**API route:** `src/app/api/stripe/payment-link/route.ts` — checks for `STRIPE_SECRET_KEY` env var, if absent returns error JSON, if present creates a Stripe Checkout session.

**No Stripe account needed to build, test, or use the rest of the platform.** Stripe is entirely optional.

---

## LEVEL 8 — FORM BUILDER + CLIENT PORTAL

*Target: Custom forms for enquiry/RSVP/feedback. Functional client portal via public token.*

---

### Step 39 — Form Register (`/app/forms`)

**File:** `src/app/(app)/forms/page.tsx`

**Layout:** PageHeader ("Forms") + KPI strip + form cards grid

**KPI cards:**
- Total Forms (count)
- Published (status = 'published')
- Total Submissions (sum of submission_count)
- New This Month (submissions in current month)

**Form card layout (grid, 3 columns desktop, 1 mobile):**
- Form title
- Form type badge
- Status badge (Draft / Published / Archived)
- Submission count
- Last submission date
- Actions: View, Edit, Copy Link (for published), Archive

**"New Form" button → `/app/forms/new`**

**Seed data (4 forms):**
```
1. Event Enquiry Form        | enquiry   | published | 8 submissions
2. Carter Wedding RSVP       | rsvp      | published | 78 submissions
3. Post-Event Feedback       | feedback  | draft     | 0 submissions
4. Supplier Info Request     | supplier-info | published | 3 submissions
```

---

### Step 40 — Form Builder (`/app/forms/new` + `/app/forms/[formId]/edit`)

**File:** `src/app/(app)/forms/new/page.tsx`

**Layout:** Two-panel builder — field palette on left, form canvas on right

**Left panel — field palette:**
Drag-from-here (or click to add) field types:
- Short Text
- Long Text
- Dropdown (Select)
- Multi-Select
- Date
- Number
- File Upload
- Section Header (non-input, visual divider)

**Right panel — form canvas:**
- Form title (editable inline)
- Form description (editable inline)
- Dropped fields list — each rendered as it will appear to submitters
- Each field has: Edit (opens inline field settings), Delete, drag handle
- Field settings panel (slides in on Edit click):
  - Label (required)
  - Placeholder text
  - Required toggle
  - Options (for select/multi-select — comma-separated or add-one-by-one)

**Bottom bar:**
- Form Type selector (Enquiry / RSVP / Feedback / Supplier Info / Custom)
- Optional: Link to Event (for RSVP and enquiry forms)
- Save as Draft | Publish

**On Publish:** Generates `share_token` (random UUID-based), sets `status = 'published'`. Shows: "Your form is live at [copy link button]"

---

### Step 41 — Form Detail + Submissions (`/app/forms/[formId]`)

**File:** `src/app/(app)/forms/[formId]/page.tsx`

**2 tabs:** Overview | Submissions

**Overview tab:**
- Form title, type, status, public link (if published)
- "Copy Link" button → copies `/f/[share_token]`
- "Embed Code" → shows `<iframe src="...">` snippet
- KPIs: Total submissions, Last submission date, Completion rate (started vs finished — future metric)

**Submissions tab:**
- Table: Submission date | Name | Email | Key field values (first 3 fields) | Actions (View)
- "Export CSV" button → downloads all submissions as CSV
- Click row → opens submission detail modal showing all field values

---

### Step 42 — Public Form Fill Page (`/app/f/[formToken]`)

**Route group:** Outside `(app)` — public, no auth  
**File:** `src/app/f/[formToken]/page.tsx`

**What:** The form the end client or guest fills in. Clean, no sidebar, workspace branding.

**Page layout:**
- Workspace logo (if branding configured in settings) or Gala Dock logo
- Form title + description
- Fields rendered in order
- "Submit" button

**Field rendering by type:**
- `short-text` → `<input type="text">`
- `long-text` → `<textarea>`
- `select` → `<select>`
- `multi-select` → checkbox group
- `date` → `<input type="date">`
- `number` → `<input type="number">`
- `file-upload` → `<label><input type="file" className="hidden" /></label>`
- `section-header` → `<h3>` styled divider

**On submit:**
1. Validate required fields
2. INSERT to `form_submissions` with `data = {field_id: value}`
3. If form type = 'enquiry' AND event form is linked → INSERT to `leads` with mapped values
4. Show success screen: "Thank you! Your submission has been received."

**Error states:** Form not found / unpublished / archived — shows appropriate message.

---

### Step 43 — Client Portal (`/app/portal/[token]`)

**Route group:** Outside `(app)` — public, token-based  
**File:** `src/app/portal/[token]/page.tsx`

**What:** The client-facing portal. No Supabase auth required — access is via a secure token tied to the event. The token is generated when the planner clicks "Invite to Portal" on the event detail.

**Token generation:** Add `portal_token` (unique, random UUID) and `portal_active` (boolean) fields to the `events` table. When planner clicks "Invite to Portal" → generate token → save → show shareable URL.

**Portal layout (clean, no sidebar):**
- Top nav: Workspace logo | Event name | "Powered by Gala Dock" (small, right)
- Navigation tabs: Overview | Documents | Invoice | Proposal | Messages

**Overview tab:**
- Event name, date, venue, status badge
- Key details card (time, location, guest count)
- "Your Event Manager: [name + email]" contact card
- Upcoming milestones (next 3 tasks marked as client-visible)

**Documents tab:**
- Files from the event where `visibility = 'client'` (add visibility field to event_files if not present, or filter by a tag)
- Each file: filename, type, uploaded date, download button (signed Supabase Storage URL)
- "Request a document" text link (opens message compose pre-filled to planner)

**Invoice tab:**
- Invoice status card: total, paid, outstanding, payment schedule progress
- Download invoice PDF button (print-optimised view)
- Payment link button (if `stripe_payment_link_url` is set on the invoice)

**Proposal tab:**
- Proposal status
- "View & Sign Proposal" button → opens the proposal signing page in a new tab (`/p/[share_token]`)
- If already signed: "Signed on [date] by [name]" confirmation

**Messages tab:**
- Thread of all `communications` where `event_id = [event]` and `direction != 'internal'`
- Compose area for client to send a message back
- On submit: INSERT to `communications` with `direction = 'inbound'`, `event_id`, `participant_name = [from portal session]`

**Security:** The portal token is long (UUID), unguessable, and stored in the database. No Supabase session required. Token validates on each page load. If `portal_active = false` → show "This portal has been deactivated by your event manager."

---

### Step 44 — Portal Invite Flow (inside event detail)

**What:** Wire the existing "Invite to Portal" button on the event detail page.

**Current state:** Button exists in the event detail UI but navigates nowhere.

**New behaviour on click:**
1. If no portal_token yet → generate UUID → UPDATE `events` SET `portal_token = [uuid]`, `portal_active = true`
2. Show modal: "Portal activated. Share this link with your client:"
   - `[https://yourdomain.com/portal/[token]]` with Copy button
   - QR code option (optional, V2)
   - "Deactivate Portal" button (sets `portal_active = false`, invalidates token)
3. If portal already active → show the existing link + "Deactivate" option

---

### Step 45 — Portal Active State Display

**What:** The event detail Overview tab should show a "Client Portal" status card when the portal is active.

**New card in event Overview tab:**
```
┌─────────────────────────────────────────────────────┐
│ 🔗 Client Portal        ● Active                    │
│                                                     │
│ Your client has access to their event portal.      │
│                                                     │
│ [Copy Portal Link]  [Deactivate]                   │
└─────────────────────────────────────────────────────┘
```

When inactive:
```
┌─────────────────────────────────────────────────────┐
│ 🔗 Client Portal        ○ Inactive                  │
│                                                     │
│ Invite your client to view their event online.     │
│                                                     │
│ [Activate Portal]                                  │
└─────────────────────────────────────────────────────┘
```

---

## LEVEL 9 — VENUE CRM

*Target: Venue directory, detail pages, document management, event creation integration.*

---

### Step 46 — Venues + VenueDocuments (DB + Types + Seed)

Already covered in Step 1 (DB) and Step 2 (types). Seed data definition:

**Seed venues (6 venues for demo):**
```
1. Thornbury Castle         | country-house | Thornbury, South Gloucestershire  | Day: 120 | Eve: 200 | £3,800–£6,200 | preferred
2. Bristol Marriott Royal   | hotel         | Bristol City Centre               | Day: 300 | Eve: 500 | £5,000–£12,000 | active
3. The Clifton Pavilion     | outdoor       | Clifton, Bristol                  | Day: 80  | Eve: 150 | £1,200–£2,800  | active
4. Tortworth Court          | manor         | Wotton-under-Edge, Gloucestershire | Day: 200 | Eve: 300 | £4,500–£9,500  | preferred
5. The Engine Shed          | conference    | Bristol Temple Meads               | Day: 400 | Eve: 600 | £6,000–£15,000 | active
6. Leigh Court             | country-house | Abbots Leigh, Bristol             | Day: 150 | Eve: 250 | £3,200–£7,500  | inactive
```

---

### Step 47 — Venues Register (`/app/venues`)

**File:** `src/app/(app)/venues/page.tsx`

**Layout:** PageHeader ("Venues") + KPI strip + filter tabs + table/cards toggle

**KPI cards:**
- Total Venues (18)
- Active This Year (7)
- Preferred (4)
- Avg Hire Cost (£4,200)

**Filter tabs:** All | Preferred | Hotels | Country Houses | Conference | Outdoor

**Table columns:**
Venue name | Location | Type | Day capacity | Evening capacity | Hire range | Last used | Status | Actions

**Cards view (alternative):**
- Cover image (if uploaded) or placeholder gradient
- Venue name (bold)
- Type badge + Status badge
- Capacity: Day X / Evening X
- Hire from £X,XXX
- City

**"Add Venue" button → `/app/venues/new`**

---

### Step 48 — Add Venue Form (`/app/venues/new`)

**File:** `src/app/(app)/venues/new/page.tsx`

**Layout:** Two-column form on desktop

**Fields:**

*Venue Details section:*
- Venue Name * (text)
- Venue Type * (select: Hotel / Country House / Conference / Outdoor / Restaurant / Barn / Manor / Other)
- Status (select: Preferred / Active / Inactive)
- Website (url, optional)
- Cover Image: `<label><input type="file" accept="image/*" className="hidden" /></label>` — upload to Supabase Storage

*Location section:*
- Address Line 1 (text)
- Address Line 2 (text)
- City (text)
- County (text)
- Postcode (text)

*Capacity & Pricing section:*
- Day Capacity (number)
- Evening Capacity (number)
- Hire Fee From (£)
- Hire Fee To (£)
- F&B Minimum Spend (£, optional)
- Setup Time (hours, number)
- Breakdown Time (hours, number)
- Parking Spaces (number)

*Contact section:*
- Contact Name (text)
- Contact Email (email)
- Contact Phone (tel)

*Notes section:*
- Accessibility Notes (textarea)
- Internal Notes (textarea)

**Buttons:** "Save Venue" → INSERT → redirect to `/app/venues/[newId]` | "Cancel"

---

### Step 49 — Venue Detail (`/app/venues/[venueId]`) — 5 Tabs

**File:** `src/app/(app)/venues/[venueId]/page.tsx`

**Layout:** EventHero-style header (cover image + venue name + type + status badge + location) + 5-tab TabNav

**Tabs:** Overview | Events | Documents | Notes | Activity

**Overview tab:**
- Left column: Venue info card (all fields, "Edit" button)
  - Capacity section: Day / Evening capacity in a 2-col grid
  - Hire pricing range: "£3,800 – £6,200" with a "Preferred" badge if preferred
  - Contact details card: name, email (mailto link), phone (tel link), website (external link icon)
  - Logistics card: Setup Xh | Breakdown Xh | Parking: X spaces
  - Accessibility: notes text
- Right column:
  - "Book for Event" button — opens event creation pre-filled with this venue (Step 51)
  - Quick stats: Times used (count), Last used (date), Total spend at this venue (£)
  - F&B Minimum: £X,XXX (if set)

**Events tab:**
- Table of all events where `venue_id = [this venue id]` or `venue_name_snapshot = [name]`
- Columns: Event name | Date | Client | Guest count | Outcome (status badge)
- "Book for New Event" button → same as Overview "Book for Event"

**Documents tab:**
- Upload area: `<label><input type="file" className="hidden" /></label>`
- Document type selector before upload: Hire Agreement / Floor Plan / H&S Policy / Insurance / Capacity Certificate / Site Map / Other
- Document table: Filename | Type | Expiry Date | Status (Active/Expiring/Expired) | Uploaded | Actions (Download, Delete)
- Upload to Supabase Storage under `venues/[venueId]/[filename]`
- Expiry date tracking: orange warning badge if expiry within 30 days, red if expired

**Notes tab:**
- Pinned notes section (sticky cards at top)
- All notes list (chronological, newest first)
- "Add Note" inline form: textarea + "Pin this note" checkbox
- Each note: body text | created by | date | Edit | Delete | Pin/Unpin toggle

**Activity tab:**
- Timeline of all changes: venue created, documents uploaded, events linked, status changes, notes added

---

### Step 50 — Venue Document Upload + Expiry Tracking

**What:** The Documents tab in venue detail handles file uploads via Supabase Storage with expiry tracking and health status.

**Upload flow:**
1. User selects document type from dropdown
2. Clicks upload area (`<label>` wrapping hidden `<input type="file">`)
3. File picker opens
4. On file select: upload to `venues/[venueId]/[docType]/[filename]` in Supabase Storage
5. Insert `venue_documents` row with `storage_key`, `filename`, `doc_type`
6. Optionally prompt for expiry date (modal: "Does this document have an expiry date?")

**Document health status logic:**
```
status = 'expired'       if expiry_date < today
status = 'expiring-soon' if expiry_date between today and today + 30 days
status = 'active'        otherwise (or no expiry date)
```

**Status badges:** `active` → green ✅ | `expiring-soon` → amber ⚠️ | `expired` → red ❌

**Download:** Signed URL via `supabase.storage.from('venues').createSignedUrl(storage_key, 3600)`

---

### Step 51 — Event Creation Wizard — Venue Field Integration

**File:** `src/app/(app)/events/new/page.tsx`

**What:** The venue field in Step 1 of the New Event Wizard changes from a free-text input to a searchable select from the Venue CRM.

**Current behaviour:** Venue name free-text input.

**New behaviour:**
- Searchable combobox: type to search venues, shows matching venue cards with type + city
- Selecting a venue auto-fills `venue_name_snapshot`, `venue_address_snapshot`, `venue_capacity_snapshot` from the venues table
- "Add as new venue" option at bottom of results (navigates to `/app/venues/new` in a new tab)
- "Enter manually" toggle reverts to free-text for venues not in the CRM

**On event creation:** When a venue is selected from the CRM, `venue_id` is also saved to the event row (not just the snapshot fields).

---

## LEVEL 10 — POLISH & SHIP

*Test, wire, and verify. Catch anything that's a loose end before calling V1.5 done.*

---

### Step 52 — Full Navigation Audit

**What:** Walk every new route and verify:
- Sidebar active state is correct for each new section
- Breadcrumbs are present on all detail pages
- Back buttons work on all new/wizard pages
- All "Cancel" buttons navigate to the correct parent
- Reports is accessible from Finance page header
- Public routes (`/portal/`, `/f/`, `/p/`) load without auth redirect

**Checklist (verify each):**
- [ ] `/app/leads` — Leads nav item active
- [ ] `/app/leads/new` — Leads nav item active, back button → `/app/leads`
- [ ] `/app/leads/[id]` — Leads nav item active, breadcrumb: Leads > Lead Title
- [ ] `/app/proposals` — No sidebar item, accessible from Leads and Finance
- [ ] `/app/venues` — Venues nav item active
- [ ] `/app/venues/[id]` — Venues nav item active, breadcrumb: Venues > Venue Name
- [ ] `/app/inbox` — Inbox nav item active + unread badge
- [ ] `/app/reports` — No sidebar item, accessible from Finance → Reports button
- [ ] `/app/forms` — No sidebar item, accessible from Library or Settings
- [ ] `/portal/[token]` — No sidebar, loads without auth
- [ ] `/f/[token]` — No sidebar, loads without auth
- [ ] `/p/[token]` — No sidebar, loads without auth

---

### Step 53 — StatusBadge Final Additions + Audit

**What:** Verify every new status used across Levels 2–9 has a corresponding entry in `STATUS_MAP`. Do a full grep for `<StatusBadge status="` to find any missing variants.

**Run:** `grep -r 'StatusBadge status=' src/` and compare against STATUS_MAP.

**Add any missed variants before shipping.**

---

### Step 54 — Empty States + Loading States Audit

**What:** Every new page must have a proper empty state and loading state. No blank white pages.

**Verify each new section has:**

| Page | Empty State | Loading State |
|---|---|---|
| `/app/leads` | "No leads yet. Add your first lead." + "New Lead" CTA | Skeleton rows |
| `/app/leads/[id]` | N/A (redirect if not found) | Skeleton layout |
| `/app/proposals` | "No proposals yet." + "New Proposal" CTA | Skeleton rows |
| Guests tab | "No guests added yet. Add guests or import from CSV." | Skeleton table |
| `/app/reports` | "Not enough data yet. Reports will populate as you use Gala Dock." | Skeleton chart areas |
| `/app/inbox` | "No conversations yet." | Skeleton list |
| Schedule tab | "No payment schedule set up." + "Set up Schedule" button | Skeleton rows |
| `/app/forms` | "No forms yet. Create your first form." | Skeleton cards |
| `/app/venues` | "No venues yet. Add your first venue." | Skeleton cards |
| Client Portal | Shows event card even with minimal data — no empty state needed | Full-page spinner |

---

### Step 55 — Security + RLS Checks

**What:** Before shipping, verify the security model on every new route.

**Checks per new section:**

| Section | Auth required | workspace_id on all queries | Tenant isolation | Public route safe |
|---|---|---|---|---|
| Leads | ✅ (app auth) | ✅ | ✅ workspace_id filter | N/A |
| Proposals | ✅ (app auth) | ✅ | ✅ workspace_id filter | N/A |
| Proposal sign (`/p/`) | ❌ public | N/A | Token-only (unguessable UUID) | ✅ read-only |
| Guests | ✅ (app auth) | ✅ | ✅ workspace_id + event_id filter | N/A |
| Reports | ✅ (app auth) | ✅ | ✅ all queries scoped | N/A |
| Inbox | ✅ (app auth) | ✅ | ✅ workspace_id filter | N/A |
| Schedules | ✅ (app auth) | ✅ | ✅ via invoice.workspace_id | N/A |
| Forms | ✅ (app auth) | ✅ | ✅ workspace_id filter | N/A |
| Form fill (`/f/`) | ❌ public | N/A | Token-only | ✅ write-only (submissions) |
| Client Portal (`/portal/`) | ❌ public | N/A | Token-only + portal_active check | ✅ limited read |
| Venues | ✅ (app auth) | ✅ | ✅ workspace_id filter | N/A |

**Critical checks:**
- [ ] `portal_token` is UUID (unguessable) and `portal_active = true` before granting portal access
- [ ] `share_token` on proposals is UUID before granting signing access  
- [ ] `share_token` on forms is UUID before allowing submissions
- [ ] Service-role key is never used in any client component or public route
- [ ] File uploads in all new sections go through Supabase Storage (not base64 in DB)
- [ ] No `stripe_payment_link_url` is exposed to untrusted users (it's just a Stripe hosted URL — acceptable)

---

### Step 56 — Build Check + Release Checklist

**What:** Final verification before calling V1.5 complete.

**Build verification:**
```bash
npm run build        # Must produce 0 errors, 0 type errors
npm run type-check   # Must pass
```

**V1.5 Release Checklist:**

**Features complete:**
- [ ] Leads / Enquiry CRM — register, kanban, detail, convert to event
- [ ] Proposals + E-Signature — wizard, detail, public sign page, convert to invoice
- [ ] Guest Management — Guests tab, RSVP, meal choices, CSV import
- [ ] Reports & Analytics — 6 tabs, CSS charts, seed data
- [ ] Communication Inbox — inbox hub, thread view, event Comms tab
- [ ] Payment Schedules — inside invoice detail, progress bar, mark paid
- [ ] BEO Export — functional from event detail, print-ready
- [ ] Stripe Payment Link — UI stub, graceful degradation when not configured
- [ ] Form Builder — field types, publish, submissions
- [ ] Client Portal — token-based, 5 sections, proposal sign, invoice
- [ ] Venue CRM — register, detail 5 tabs, documents, event wizard integration

**Quality gates:**
- [ ] All empty states present
- [ ] All loading states present
- [ ] No dead buttons
- [ ] All seed data displaying correctly
- [ ] All new StatusBadge variants rendering correctly
- [ ] Sidebar active states correct for all new routes
- [ ] Public routes load without auth redirect
- [ ] Build compiles clean

**Addons confirmed as NOT included (by design):**
- [ ] No Twilio SMS wired (V2 addon)
- [ ] No WhatsApp API (V2 addon)  
- [ ] No Xero/QuickBooks (V2 medium-term)
- [ ] No real email sending from Inbox (V2 — Resend integration)
- [ ] Stripe payment links are optional (env-gated, zero cost if not configured)
- [ ] AI features remain in mock mode until Anthropic API key is provided

---

## ADDON REGISTER (V2 — when to activate)

These are features that are architecturally stubbed or wired in V1.5 but require a paid third-party service. None are blocking. None are on by default.

| Addon | Trigger to activate | Integration | Estimated cost |
|---|---|---|---|
| **Stripe Payments** | Client wants online card payments | Stripe Checkout API | 1.4% + 20p/transaction (UK cards). No setup cost. |
| **Email Sending** | Inbox "Send Email" button | Resend.com | Free tier: 3,000 emails/month. $20/month for 50k. |
| **SMS Reminders** | Payment/task reminders via SMS | Twilio | ~£0.04/SMS. Only activated when planner enables. |
| **WhatsApp Business** | Clients prefer WhatsApp | Meta Cloud API | Conversation-based pricing ~$0.03–0.08/convo. |
| **Xero Sync** | Accountant integration | Xero API | Free to connect, standard Xero subscription required on their end. |
| **AI Proposal Generator** | Copilot → generate full proposal | Anthropic API (already in project) | Usage-based, ~$0.003/1k tokens. |
| **AI Natural Language Q&A** | "What's overdue for Carter Wedding?" | Anthropic API | Same as above. |

---

---

## LEVEL 11 — SUPPLIER MANAGEMENT DEPTH

*Target: Operational supplier engine. RFQ, comparison, live portal, rate cards, availability, performance scoring. Best in market at any price point.*

---

### Step 57 — Multi-Contact per Supplier + Supplier Contacts Table

**What:** Large suppliers have multiple contacts with different roles. The current supplier model has a single contact. Add a `supplier_contacts` table and a Contacts section to the supplier detail.

**New DB table:**
```sql
supplier_contacts (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  supplier_id uuid NOT NULL,  -- FK to suppliers
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text,
    -- values: primary | account-manager | operations | finance | on-site | other
  email text,
  phone text,
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

**TypeScript type:**
```typescript
export type SupplierContactRole = "primary" | "account-manager" | "operations" | "finance" | "on-site" | "other";
export interface SupplierContact {
  id: string; workspace_id: string; supplier_id: string;
  first_name: string; last_name: string; role: SupplierContactRole | null;
  email: string | null; phone: string | null;
  notes: string | null; is_primary: boolean;
  created_at: string; updated_at: string;
}
```

**UI change — Supplier Detail Overview tab:**
Replace the single contact section with a "Contacts" sub-section showing all `supplier_contacts` rows.
- Each contact card: name, role badge, email (mailto), phone (tel), "Primary" indicator
- "Add Contact" button → inline form (first name, last name, role, email, phone)
- Edit / Remove per contact

**On supplier creation wizard:** Step 1 captures the primary contact as before. On save, this auto-inserts as a `supplier_contacts` row with `is_primary = true`.

---

### Step 58 — Supplier Rate Cards

**What:** Suppliers have predefined service pricing that auto-populates into quotes. Eliminates manual rate entry on every quote.

**New DB table:**
```sql
supplier_rate_cards (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  service_name text NOT NULL,    -- "Three-Course Formal Dinner"
  description text,
  unit text,                     -- "per head" | "per day" | "per event" | "per hour" | "flat fee"
  unit_price_pence bigint NOT NULL,
  min_quantity integer,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

**UI — New "Rate Card" tab in Supplier Detail:**
- Table: Service | Unit | Price | Min Qty | Active
- "Add Rate" button → inline form
- Edit/Delete per rate
- "Apply to Quote" button per rate → adds the rate as a line item to a quote (select which quote via modal)

**Integration with Quote creation:**
In the new quote form, when a supplier is selected, a "Load from Rate Card" option appears. Clicking it shows the supplier's rate cards as selectable line items. Selected rates auto-populate description, unit price, and unit.

**Seed data for Noble Kitchen Co.:**
```
Three-Course Formal Dinner   | per head     | £52.00
Canapé Reception (12 pieces) | per head     | £28.00
Afternoon Tea                | per head     | £24.00
Wedding Breakfast            | per head     | £68.00
Staff (Event Server)         | per hour     | £18.00
Hire (Silver Cutlery Set)    | per event    | £380.00
```

---

### Step 59 — RFQ Engine (Request for Quote)

**What:** The highest-impact supplier feature. Send a structured quote request to multiple suppliers simultaneously. Each gets a public link to respond. Compare all responses in one view.

**New DB tables:**
```sql
rfqs (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid,                 -- optional link
  title text NOT NULL,           -- "Catering for Carter Wedding"
  service_category text,
  brief text,
  event_date date,
  event_location text,
  guest_count integer,
  budget_pence bigint,
  deadline date,                 -- response deadline
  status text NOT NULL DEFAULT 'draft',
    -- values: draft | sent | responses-received | closed | awarded
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)

rfq_recipients (
  id uuid PK default gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL,
  response_token text UNIQUE,    -- public link token for supplier response
  status text NOT NULL DEFAULT 'pending',
    -- values: pending | viewed | responded | declined | awarded | rejected
  response_total_pence bigint,
  response_notes text,
  response_items jsonb DEFAULT '[]',
    -- [{description, quantity, unit_price_pence, total_pence}]
  response_attachments jsonb DEFAULT '[]',
  responded_at timestamptz,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**TypeScript types:**
```typescript
export type RFQStatus = "draft" | "sent" | "responses-received" | "closed" | "awarded";
export type RFQRecipientStatus = "pending" | "viewed" | "responded" | "declined" | "awarded" | "rejected";
export interface RFQ {
  id: string; workspace_id: string; event_id: string | null;
  title: string; service_category: string | null; brief: string | null;
  event_date: string | null; event_location: string | null;
  guest_count: number | null; budget_pence: number | null;
  deadline: string | null; status: RFQStatus;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface RFQRecipient {
  id: string; rfq_id: string; supplier_id: string;
  response_token: string | null; status: RFQRecipientStatus;
  response_total_pence: number | null; response_notes: string | null;
  response_items: unknown[]; response_attachments: unknown[];
  responded_at: string | null; viewed_at: string | null; created_at: string;
}
```

**New routes:**
```
src/app/(app)/rfqs/page.tsx               — RFQ register
src/app/(app)/rfqs/new/page.tsx           — Create RFQ
src/app/(app)/rfqs/[rfqId]/page.tsx       — RFQ detail + comparison matrix
src/app/rfq/[token]/page.tsx              — Public supplier response page (no auth)
```

**Add to proxy.ts PUBLIC_PREFIXES:** `"/rfq"`

**`/app/rfqs` Register:**
- KPI strip: Total RFQs | Active (sent, awaiting responses) | Responses Received | Awarded
- Table: Title | Event | Category | Sent to (count) | Responses (count) | Deadline | Status
- "New RFQ" button

**`/app/rfqs/new` — Create RFQ Wizard (3 steps):**

Step 1 — Brief:
- Title, Service Category (select: Catering / AV & Tech / Floristry / Photography / Entertainment / Staffing / Security / Venue / Transport / Other)
- Optional: Link to Event
- Brief (textarea — describe exactly what's needed)
- Event Date, Location, Guest Count, Budget (£)
- Response Deadline

Step 2 — Select Suppliers:
- List of all workspace suppliers, filterable by category
- Checkboxes to select recipients
- Min 1, max unlimited
- Shows each supplier's: name, category, health score, last quote date

Step 3 — Preview & Send:
- Preview the RFQ as the supplier will see it
- "Send RFQ" button → generates unique `response_token` per recipient → sets status = 'sent'
- Each supplier token URL shown for reference

**`/app/rfq/[token]` — Public Supplier Response Page:**
- Shows RFQ details (title, brief, event date, location, guest count, budget)
- "Auto-viewed" on load: UPDATE rfq_recipients SET viewed_at = now(), status = 'viewed'
- Response form:
  - Line items (description, qty, unit price — "Add Item" rows)
  - Total (auto-calculated)
  - Notes / additional terms
  - File attachments: `<label><input type="file" className="hidden" multiple /></label>`
  - "Submit Response" button
- On submit: UPDATE rfq_recipients SET response_total_pence, response_notes, response_items, response_attachments, responded_at, status = 'responded'
- "Decline" button → sets status = 'declined' + optional decline reason

**`/app/rfqs/[rfqId]` — RFQ Detail + Comparison Matrix:**
- Left: RFQ info card (brief, event details, deadline, status)
- Main: Recipients table showing status per supplier
- When ≥ 2 responses received → "Compare Responses" tab appears

**Comparison Matrix tab:**
Side-by-side table:
```
                    | Noble Kitchen Co. | Crown Catering | Gourmet Events
--------------------|-------------------|----------------|---------------
Total               | £4,200           | £3,800         | £4,600
Per Head (120 guests)| £35.00          | £31.67         | £38.33
Inclusions          | Full dinner + staff| Dinner only  | Dinner + styling
Response date       | 3 Jun 2026       | 4 Jun 2026     | 5 Jun 2026
Attachment          | [Quote PDF]      | [Quote PDF]    | —
Notes               | "Inclusive of..." | "Staff extra" | —
                    | [★ Award]        | [★ Award]     | [★ Award]
```

Auto-flag: "Best value: Crown Catering (£31.67/head)" in amber info bar.

**"Award" button:** Sets that recipient to `status = 'awarded'`, all others to `status = 'rejected'`. Creates a draft quote in the Finance section pre-filled with the supplier's response. Sets RFQ status = 'awarded'.

**StatusBadge additions:** `"rfq-draft"` | `"rfq-sent"` | `"rfq-responded"` | `"rfq-awarded"` | `"rfq-closed"` → add to STATUS_MAP.

---

### Step 60 — Quote Comparison Matrix (within existing Quotes)

**What:** When multiple quotes exist for the same event and service category, show a comparison view inside the Finance → Quotes section.

**Finance → Quotes tab enhancement:**
- Group quotes by event (if event_id is set)
- Within a group, if ≥ 2 quotes exist for the same supplier category → "Compare" button appears
- Compare modal: side-by-side table (same matrix structure as Step 59)
- "Set as Preferred" flag per quote

This is lightweight — purely a UI view layer over existing quotes data. No new DB tables.

---

### Step 61 — Supplier Portal (Live)

**What:** The existing "Invite to Portal" button on supplier detail actually works. Suppliers get a magic link, log in, see their events, submit quotes, upload their own documents.

**New DB table:**
```sql
supplier_portal_sessions (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  access_token text UNIQUE NOT NULL,
  portal_active boolean NOT NULL DEFAULT true,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**New routes:**
```
src/app/supplier-portal/[token]/page.tsx          — Portal home
src/app/supplier-portal/[token]/quotes/page.tsx   — Quote requests
src/app/supplier-portal/[token]/events/page.tsx   — Confirmed events
src/app/supplier-portal/[token]/documents/page.tsx — Upload documents
```

**Add to proxy.ts PUBLIC_PREFIXES:** `"/supplier-portal"`

**Supplier portal layout:**
- Clean header: workspace logo | "Supplier Portal" label | Supplier name
- Navigation tabs: Overview | Quote Requests | My Events | Documents

**Overview tab:**
- "Hello, [supplier name]" welcome card
- Active quote requests badge
- Upcoming confirmed events
- Document health (what's missing or expiring)

**Quote Requests tab:**
- List of quotes where `supplier_id = [this supplier]` and `status = 'sent'`
- Each row: event name | service | requested date | deadline
- "Respond to Quote" → opens a form to submit their pricing + line items + attachments
- "Decline" option with reason

**My Events tab:**
- All events where this supplier is confirmed
- Event name, date, location, status, planner contact
- "Event details" view: their specific brief, on-site time, contact for the day

**Documents tab:**
- Their uploaded documents (insurance, T&Cs, contracts)
- Upload: `<label><input type="file" className="hidden" /></label>`
- Each doc: filename, type, expiry date (enter on upload), status badge
- Uploaded docs sync into the supplier's Documents tab in the main app (same `supplier_documents` table)

**Invite flow (in main app, Supplier Detail):**
"Invite to Portal" button → generates `access_token` → shows modal: "Portal activated. Send this link to [supplier name]:" with copy button and deactivate option.

---

### Step 62 — Supplier Availability

**What:** Suppliers can have blocked dates. When assigning a supplier to an event, the system warns if they're already booked.

**New DB table:**
```sql
supplier_blocked_dates (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  blocked_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**UI — New "Availability" section in Supplier Detail Overview tab:**
- Mini calendar (current month + next month) showing blocked dates in red
- "Mark date as unavailable" → date picker + optional reason
- "Remove block" per date
- Small note: "Blocking dates here helps you avoid conflicts when assigning suppliers to events."

**Integration with Event → Suppliers tab:**
When adding/confirming a supplier on an event, check if any `supplier_blocked_dates` overlap with the event date range. If yes → show a yellow warning: "⚠ [Supplier] has marked [date] as unavailable. Confirm you've checked availability directly."

---

### Step 63 — Supplier Performance Scoring (Automated)

**What:** The health score currently tracks document compliance. The performance score is a composite automated metric shown on each supplier card and detail page.

**Score components (each 0–20 points, total 0–100):**

| Component | Source | Max points |
|---|---|---|
| Document health | % of required docs complete & not expired | 20 |
| Quote response time | Avg hours to respond to quotes (< 24h = 20, < 48h = 15, < 72h = 10, > 72h = 5) | 20 |
| Quote acceptance rate | % of sent quotes that were accepted | 20 |
| Event delivery | Events marked completed without issues / total events | 20 |
| Post-event rating | Average manual rating (1–5 stars → ×4 = up to 20 pts) | 20 |

**New field on supplier detail:**
```sql
-- Add computed column or cached field to suppliers table:
performance_score integer,  -- 0–100, recalculated on relevant events
last_rated_at timestamptz
```

**Rating flow:** After an event is marked completed, a prompt appears on the event detail → Suppliers tab: "Rate your suppliers for this event." Star rating (1–5) per supplier. Optional note. Saves to a `supplier_ratings` table, triggers score recalculation.

**New DB table:**
```sql
supplier_ratings (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  event_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**Display:**
- Supplier card in the register: health score bar (existing) + performance score number badge
- Supplier detail overview: Performance section showing composite score + breakdown bars per component

---

## LEVEL 12 — TEAM & STAFFING

*Target: Full team operational layer — who is on which event, shift times, workload visibility, run sheet assignments.*

---

### Step 64 — Event Staff Assignments

**What:** Each event has a team assignment card showing which workspace members are on the event and in what role.

**New DB table:**
```sql
event_staff_assignments (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'team-member',
    -- values: lead-event-manager | on-site-support | finance-lead | creative-lead | logistics | coordinator | team-member
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

**TypeScript type:**
```typescript
export type EventStaffRole = "lead-event-manager" | "on-site-support" | "finance-lead" | "creative-lead" | "logistics" | "coordinator" | "team-member";
export interface EventStaffAssignment {
  id: string; workspace_id: string; event_id: string;
  user_id: string; role: EventStaffRole; notes: string | null;
  is_primary: boolean; created_at: string; updated_at: string;
}
```

**UI — Event Detail Overview tab, new "Team" section:**
```
Team
────────────────────────────────────────────────
● Nina Costa       Lead Event Manager    [Primary]
  Alex Burns       On-Site Support
  James Liu        Finance Lead
────────────────────────────────────────────────
[+ Assign Team Member]
```

**"Assign Team Member" action:** Modal with: workspace member select (searchable), role select, "Is Lead?" toggle. INSERT to `event_staff_assignments`.

**Remove from event:** X button per assignment → DELETE with confirm.

---

### Step 65 — Team Workload Dashboard

**What:** A page (linked from Settings → Team) showing all team members' current load. Who is overloaded vs available.

**Route:** `src/app/(app)/settings/team/workload/page.tsx`

**Layout:** PageHeader ("Team Workload") + date range picker + workload table

**Workload table columns:**
Team member | Active events (assigned) | Tasks (total) | Overdue tasks | Next event date | Load indicator

**Load indicator (CSS pill):**
- 0–2 events: Light (success green)
- 3–5 events: Moderate (warning amber)
- 6+ events: Heavy (danger red)

**Row expansion:** Click a team member row → expands to show their 3 upcoming events + 3 overdue tasks.

**"Reassign Task" quick action in expanded view:** Opens task detail sidebar pre-loaded.

---

### Step 66 — Staff Scheduling per Event (Shift Times)

**What:** Assign specific on-site shift windows to each team member for event day. Different from task assignment — this is "who is physically there and when."

**New field on `event_staff_assignments`:**
```sql
ALTER TABLE event_staff_assignments ADD COLUMN shift_start_time time;
ALTER TABLE event_staff_assignments ADD COLUMN shift_end_time time;
ALTER TABLE event_staff_assignments ADD COLUMN shift_date date;
ALTER TABLE event_staff_assignments ADD COLUMN shift_notes text;
```

**UI — Event Detail → new "Staffing" tab (tab 10 after Guests):**

```
EVENT DAY STAFFING SCHEDULE
────────────────────────────────────────────────────────────
Name                  Role                  Shift
────────────────────────────────────────────────────────────
Nina Costa            Lead Event Manager    07:30 – 23:00
Alex Burns            On-Site Support       08:00 – 16:00
James Liu             Finance Lead          12:00 – 20:00
────────────────────────────────────────────────────────────
Total hours scheduled: 38.5
```

**Edit shift:** Inline edit for start time, end time, date.

**"Add to Run Sheet" button:** Creates a run sheet item: "[Name] arrives on-site" at shift start time.

---

### Step 67 — Run Sheet Item Assignments (Team Member per Item)

**What:** Each run sheet item can be assigned to a specific team member. On Event Day Mode, each person sees their own filtered view of the run sheet.

**Run sheet enhancement:**
```sql
-- Add to run_sheet_items (if table exists) or the run sheet data structure:
ALTER TABLE run_sheet_items ADD COLUMN assigned_to uuid REFERENCES auth.users(id);
```

**Run Sheet tab UI change:**
Each run sheet item gets an "Assign to" avatar/select at the end of the row. If already assigned, shows the team member's initials in a coloured circle.

**Event Day Mode enhancement (`/events/[eventId]/event-day`):**
Add a "My Items" filter toggle in Event Day Mode. When toggled on, the run sheet filters to only show items assigned to the current logged-in user. This makes Event Day Mode genuinely useful for teams of 3–10 people all working from their phone.

---

### Step 68 — Team Calendar

**What:** A calendar view showing all team members' event assignments across the month. Spot clashes and coverage gaps.

**Route:** `src/app/(app)/tasks/team-calendar/page.tsx`  
(Linked from the Tasks section — alongside the existing `/tasks/calendar`)

**Layout:** Month calendar grid. Each day cell shows assigned team members' events as coloured blocks.

**View toggle at top:** "My Events" (current user only) | "Full Team" (all members)

**Each event block shows:** Event name (truncated) + team member avatar(s)

**Conflict detection:** If the same team member is on two events on the same day → block turns amber + "Conflict" label.

**"Assign team to event" shortcut:** Clicking an empty day → suggests upcoming events without full team assigned.

---

### Step 69 — Team Availability / Out of Office

**What:** Team members can mark themselves as unavailable for date ranges. Warnings surface when assigning to events.

**New DB table:**
```sql
team_availability_blocks (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
    -- values: holiday | sick | training | personal | external-event | other
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**UI — Settings → Account → new "My Availability" section:**
- Calendar view of current + next month
- "Mark as unavailable" → date range picker + reason select
- All blocked ranges shown in red
- "Remove block" per range

**Integration warnings:**
- When assigning a team member to an event (Step 64), check overlap with `team_availability_blocks`. If overlap → warning: "⚠ [Name] has marked [dates] as unavailable."
- On Team Workload Dashboard (Step 65), show "Out of Office" label on dates with availability blocks.

---

## LEVEL 13 — FLOOR PLAN BUILDER

*Target: SVG-based drag-drop floor plan canvas. Guest seating integration. Multi-layout per event. Print/share. No paid library.*

---

### Step 70 — Floor Plan Tab in Event Detail + DB Schema

**What:** Add "Floor Plan" as a tab in the event detail page (tab 11 after Staffing).

**New DB tables:**
```sql
event_floor_plans (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Floor Plan',
  layout_type text NOT NULL DEFAULT 'dinner',
    -- values: ceremony | drinks-reception | dinner | evening | other
  room_name text,
  room_width_m numeric,
  room_height_m numeric,
  background_color text DEFAULT '#f8f7fc',
  canvas_json jsonb NOT NULL DEFAULT '[]',
    -- Array of element objects (see spec below)
  share_token text UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

**Canvas element JSON spec (stored in `canvas_json` array):**
```typescript
interface FloorPlanElement {
  id: string;           // uuid
  type: FloorPlanElementType;
  x: number;           // position on canvas (px from top-left)
  y: number;
  width: number;
  height: number;
  rotation: number;    // degrees 0–360
  label: string;       // "Table 1", "Stage", etc.
  color: string | null;
  capacity: number | null;  // for tables
  guest_ids: string[];      // EventGuest IDs assigned to this element
  locked: boolean;          // prevents accidental drag
}

export type FloorPlanElementType =
  | "round-table-6" | "round-table-8" | "round-table-10" | "round-table-12"
  | "rect-table-6" | "rect-table-8"
  | "cocktail-table"
  | "chair"
  | "stage" | "dance-floor" | "dj-booth"
  | "bar" | "photo-booth" | "registration-desk"
  | "sofa-group" | "buffet-table"
  | "text-label" | "divider-wall" | "entrance";
```

**TypeScript type:**
```typescript
export type FloorPlanLayoutType = "ceremony" | "drinks-reception" | "dinner" | "evening" | "other";
export interface EventFloorPlan {
  id: string; workspace_id: string; event_id: string;
  title: string; layout_type: FloorPlanLayoutType;
  room_name: string | null; room_width_m: number | null; room_height_m: number | null;
  background_color: string; canvas_json: FloorPlanElement[];
  share_token: string | null; created_by: string | null;
  created_at: string; updated_at: string;
}
```

---

### Step 71 — Floor Plan Canvas Component (SVG-Based)

**File:** `src/components/floor-plan/FloorPlanCanvas.tsx`

**What:** The core drag-drop canvas. Built entirely with SVG + React state + native mouse events. No Fabric.js, no Konva, no paid library.

**Architecture:**
```typescript
// Props
interface FloorPlanCanvasProps {
  elements: FloorPlanElement[];
  onElementsChange: (elements: FloorPlanElement[]) => void;
  guests?: EventGuest[];  // for seating integration
  readOnly?: boolean;
  width?: number;
  height?: number;
}
```

**Canvas state management:**
- `elements` — array of all placed elements (from DB)
- `selectedId` — currently selected element ID (shows handles + property panel)
- `dragging` — `{id, startX, startY, origX, origY}` during drag
- `scale` — zoom level (0.5 to 2.0) via wheel or +/- buttons

**Drag implementation (pure React, no library):**
```typescript
// On element mousedown:
setDragging({ id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });

// On SVG mousemove (when dragging):
const dx = e.clientX - dragging.startX;
const dy = e.clientY - dragging.startY;
updateElement(dragging.id, { x: dragging.origX + dx, y: dragging.origY + dy });

// On mouseup: setDragging(null) + save to DB
```

**Selection handles:** When an element is selected, show 8 resize handles (corners + midpoints) as small squares. Rotation handle at top.

**Snap to grid:** Optional 10px grid snap (`Math.round(x / 10) * 10`).

**Auto-save:** Debounced 1.5s save to Supabase after any element change.

---

### Step 72 — Floor Plan Element Library Panel

**File:** `src/components/floor-plan/ElementLibrary.tsx`

**What:** Left-side panel in the floor plan editor showing all draggable element types. Click to add at center of canvas, or drag directly onto canvas.

**Panel sections:**

*Tables*
- Round 6 | Round 8 | Round 10 | Round 12
- Rectangular 6 | Rectangular 8
- Cocktail / Poseur

*Room Features*
- Stage | Dance Floor | DJ Booth
- Bar | Photo Booth | Registration Desk

*Seating*
- Chair (individual)
- Sofa Group

*Other*
- Text Label | Buffet Table | Divider/Wall | Entrance marker

**Element visual rendering in SVG:**
- Round table: `<circle>` with chair `<circle>` elements arranged radially
- Rectangular table: `<rect>` with chair `<rect>` elements on sides
- Stage: `<rect>` with diagonal stripe pattern fill
- Dance floor: `<rect>` with checkerboard pattern
- All elements: label text below via `<text>` SVG element

**Element properties panel (right sidebar when element selected):**
- Label (editable text input)
- Color picker (accent colour for the element)
- Capacity (for tables)
- Lock/Unlock toggle
- Duplicate button
- Delete button
- Rotation slider (0–360°)

---

### Step 73 — Guest Seating Integration

**What:** Tables in the floor plan can have guests from the event guest list assigned to specific seats.

**UI — Guest Panel (right side, toggleable):**
When any table element is selected → a "Seating" section appears in the right panel:
- Capacity indicator: "5 of 8 seats filled"
- Seated guests list (names, RSVP status, dietary dot)
- "Add Guest" → searchable dropdown of `event_guests` for this event (filtered to unseated guests)
- Remove guest from seat button (X per name)
- Dietary flag: coloured dot next to name (🟡 = dietary note, 🔴 = allergy, ⬜ = none)

**Unseated guests panel (collapsible bottom drawer):**
Shows count and names of all confirmed guests without a table assignment. Quick drag from list to table.

**Guest list pill on table in canvas:**
When a table has ≥ 1 guest assigned → a small pill below the table label shows "5/8" (seated/capacity).

**Seating report button (floor plan header):**
"Seating Summary" → opens a modal listing every table with its guest names, dietary flags, and any empty seats. Print-ready format (same print CSS pattern as BEO).

---

### Step 74 — Multiple Layouts per Event

**What:** An event can have multiple floor plans (Ceremony, Drinks Reception, Dinner, Evening). Each is a separate canvas stored in `event_floor_plans`.

**Floor Plan tab layout:**
- Tab header: "Floor Plans" with a `+` button to add a new layout
- Sub-tabs below: one per floor plan (e.g. "Ceremony" | "Dinner" | "+ Add Layout")
- Each sub-tab is its own independent canvas
- "Duplicate Layout" option → copies the full `canvas_json` to a new record

**"Add Layout" flow:**
- Modal: title (e.g. "Evening Reception"), layout type (select)
- Option: "Start blank" or "Duplicate from existing layout"
- Creates new `event_floor_plans` row → opens canvas

**Layout presets (when starting blank):**
Preset templates to accelerate setup:
- Theatre style — rows of chairs facing a stage
- Banquet — long rectangular tables in parallel rows
- Cabaret — round tables, chairs on 3 sides facing stage
- Cocktail / Standing — scattered cocktail tables, no chairs
- U-Shape — rectangular tables in U formation
Each preset generates a starter `canvas_json` that can then be customised.

---

### Step 75 — Floor Plan Print, Export and Share

**What:** Print the floor plan as a clean document. Generate a read-only share link for the venue.

**Print:**
- "Print / Save as PDF" button in floor plan header
- `@media print` CSS hides sidebar, element panel, all controls
- Canvas renders full-width on A4 landscape
- Header: event name, layout name, date, generated by [workspace name]
- Footer: "Gala Dock — Floor Plan"

**PNG Export:**
- "Export as Image" button
- Uses `html2canvas` (MIT license, free) to capture the SVG canvas as a PNG
- Filename: `[event-name]-[layout-type]-floorplan.png`
- Alternative if html2canvas not used: use SVG `foreignObject` serialisation — no library needed

**Share Link:**
- "Share with Venue" button → generates `share_token` on the floor plan record
- Creates read-only URL: `/floor-plan/[share_token]`
- Public route (no auth): shows the canvas in read-only mode with no editing controls
- "This floor plan was shared by [workspace name]" header

**New public route:**
```
src/app/floor-plan/[token]/page.tsx
```
Add `/floor-plan` to proxy.ts PUBLIC_PREFIXES.

---

## LEVEL 14 — VENUE-SIDE MANAGEMENT (OPTION B)

*Target: Dual-sided platform. Venues use Gala Dock to manage their own bookings, spaces, F&B, staff and clients. This is what Tripleseat, Releventful and Momentus charge enterprise prices for — built into Gala Dock at a fraction of the cost.*

---

### Step 76 — Venue Account Type + Onboarding

**What:** Introduce a second account type: "Venue Account" — distinct from the existing "Agency Account." A Venue Account has a different dashboard, different nav, and different data model.

**Account type stored on `workspaces`:**
```sql
ALTER TABLE workspaces ADD COLUMN account_type text NOT NULL DEFAULT 'agency';
  -- values: agency | venue
ALTER TABLE workspaces ADD COLUMN venue_id uuid;  -- FK to venues table for venue accounts
```

**Venue onboarding wizard (new route):**
```
src/app/onboarding/venue/page.tsx
```

Steps:
1. Venue name, type, address
2. Spaces (add at least one bookable space)
3. Contact + team setup
4. Package pricing (optional at setup)
5. Done → redirect to `/venue-ops/home`

**Venue-side route group:**
```
src/app/(venue-ops)/
```

Separate from `(app)` group. Own layout, own sidebar, own nav.

**Venue-side nav items:**
Home | Bookings | Calendar | Spaces | F&B | Staff | Clients | Reports | Settings

---

### Step 77 — Venue Spaces Inventory

**What:** Each venue has multiple bookable spaces. Each space is independently bookable with its own capacity, pricing, and availability.

**New DB table:**
```sql
venue_spaces (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES venues(id),
  name text NOT NULL,             -- "Grand Ballroom", "Garden Terrace", "Conference Suite A"
  description text,
  capacity_seated integer,
  capacity_standing integer,
  capacity_theatre integer,
  capacity_cabaret integer,
  capacity_boardroom integer,
  hire_fee_pence bigint,           -- base hire fee
  hire_fee_half_day_pence bigint,
  hire_fee_full_day_pence bigint,
  setup_hours numeric NOT NULL DEFAULT 2,
  breakdown_hours numeric NOT NULL DEFAULT 2,
  floor_area_sqm numeric,
  ceiling_height_m numeric,
  av_included boolean DEFAULT false,
  natural_light boolean DEFAULT false,
  accessibility boolean DEFAULT false,
  cover_path text,                 -- Supabase Storage key for space photo
  status text NOT NULL DEFAULT 'active',
    -- values: active | maintenance | inactive
  sort_order integer DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

**TypeScript type:**
```typescript
export interface VenueSpace {
  id: string; workspace_id: string; venue_id: string;
  name: string; description: string | null;
  capacity_seated: number | null; capacity_standing: number | null;
  capacity_theatre: number | null; capacity_cabaret: number | null; capacity_boardroom: number | null;
  hire_fee_pence: number | null; hire_fee_half_day_pence: number | null; hire_fee_full_day_pence: number | null;
  setup_hours: number; breakdown_hours: number;
  floor_area_sqm: number | null; ceiling_height_m: number | null;
  av_included: boolean; natural_light: boolean; accessibility: boolean;
  cover_path: string | null; status: string; sort_order: number;
  deleted_at: string | null; created_at: string; updated_at: string;
}
```

**Venue-Side route:** `src/app/(venue-ops)/spaces/page.tsx` + `src/app/(venue-ops)/spaces/[spaceId]/page.tsx`

**Spaces register:** Card grid — space photo (or gradient placeholder) | name | capacity badges (seated/standing/theatre) | hire fee | status badge | "View Bookings" button.

**Space detail — 4 tabs:** Overview | Bookings | Documents | Activity

---

### Step 78 — Availability Calendar (Per Space, Double-Booking Prevention)

**What:** The heart of any venue management system. A visual calendar per space showing what's booked, what's held, and what's available. Double-booking is enforced at DB level.

**New DB tables:**
```sql
venue_bookings (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  space_id uuid NOT NULL REFERENCES venue_spaces(id),
  booking_ref text UNIQUE NOT NULL,  -- e.g. "VB-2026-0041"
  event_name text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  client_company text,
  event_type text,
  event_date date NOT NULL,
  setup_from timestamptz NOT NULL,   -- when setup crew arrives
  event_start timestamptz NOT NULL,  -- when event starts
  event_end timestamptz NOT NULL,    -- when event ends
  breakdown_until timestamptz NOT NULL, -- when space is cleared
  guest_count integer,
  status text NOT NULL DEFAULT 'enquiry',
    -- values: enquiry | hold | provisional | confirmed | delivered | cancelled | no-show
  hold_expires_at timestamptz,   -- auto-expire provisional holds
  deposit_paid_pence bigint DEFAULT 0,
  total_value_pence bigint DEFAULT 0,
  linked_planner_event_id uuid,  -- if the booking planner also uses Gala Dock
  linked_workspace_id uuid,      -- their workspace (for dual-sided sync)
  notes text,
  portal_token text UNIQUE,      -- client-facing portal access
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)

-- Double-booking prevention at DB level:
CREATE UNIQUE INDEX venue_booking_no_overlap
  ON venue_bookings (space_id, event_date)
  WHERE status NOT IN ('cancelled', 'no-show');
-- Note: full time-range overlap prevention requires a CHECK constraint or trigger
```

**TypeScript type:**
```typescript
export type VenueBookingStatus = "enquiry" | "hold" | "provisional" | "confirmed" | "delivered" | "cancelled" | "no-show";
export interface VenueBooking {
  id: string; workspace_id: string; venue_id: string; space_id: string;
  booking_ref: string; event_name: string;
  client_name: string; client_email: string | null; client_phone: string | null; client_company: string | null;
  event_type: string | null; event_date: string;
  setup_from: string; event_start: string; event_end: string; breakdown_until: string;
  guest_count: number | null; status: VenueBookingStatus;
  hold_expires_at: string | null; deposit_paid_pence: number;
  total_value_pence: number; linked_planner_event_id: string | null; linked_workspace_id: string | null;
  notes: string | null; portal_token: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
```

**Venue-side calendar route:** `src/app/(venue-ops)/calendar/page.tsx`

**Calendar layout:**
- Monthly view (default) or weekly view toggle
- Y-axis: each space as a lane (Grand Ballroom | Garden Terrace | Conference Suite A | ...)
- X-axis: days of the month
- Booking blocks: coloured by status (enquiry=blue, hold=amber, confirmed=green, delivered=surface)
- Click a booking block → opens booking detail slide-over
- Click an empty cell → opens "New Booking" quick form

**Conflict guard:**
On new booking save → DB checks for overlap on same space. If conflict detected → error: "Grand Ballroom is already booked on [date] ([booking ref: VB-2026-0038]). Dates cannot overlap."

---

### Step 79 — Venue-Side Lead Intake + Booking Lifecycle

**What:** The full lifecycle from first enquiry to delivered event. Mirrors the agency-side Leads CRM but from the venue's perspective.

**Venue bookings register:** `src/app/(venue-ops)/bookings/page.tsx`

**KPI cards:**
- Enquiries This Month | Confirmed This Year | Provisional Holds | Cancellations

**Status pipeline (horizontal progress bar):**
Enquiry → Hold → Provisional → Confirmed → Delivered

**Status transition rules:**
```
enquiry → hold (venue places a 7-day hold, sends hold confirmation)
hold → provisional (hire agreement sent, awaiting signature)
provisional → confirmed (agreement signed + deposit paid)
confirmed → delivered (event date passed, marked complete)
Any status → cancelled (with reason + cancellation fee record)
```

**Hold auto-expiry:**
`hold_expires_at` is set to `now() + 7 days` when a hold is created. A background check (or on-load check) flags holds past their expiry date and prompts the venue manager to confirm, extend, or release.

**New Booking form (`/venue-ops/bookings/new`):**
- Client name, email, phone, company
- Event name, event type
- Space (select from venue_spaces)
- Event date
- Setup from, event start, event end, breakdown until (time pickers)
- Guest count, budget indication, notes

**Booking detail page (`/venue-ops/bookings/[bookingId]`):**
4 tabs: Overview | F&B | Staffing | Comms

Overview: Full booking card, client contact, status actions (move through pipeline), linked invoice, linked floor plan.

---

### Step 80 — F&B Package Management

**What:** The venue defines catering packages with per-head pricing. Packages attach to bookings and contribute to total booking value.

**New DB tables:**
```sql
venue_fb_packages (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  name text NOT NULL,               -- "Three-Course Formal Dinner"
  description text,
  package_type text,
    -- values: breakfast | lunch | dinner | afternoon-tea | canape | drinks | full-day | custom
  price_per_head_pence bigint,
  minimum_heads integer,
  includes_staff boolean DEFAULT false,
  includes_av boolean DEFAULT false,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)

venue_booking_fb_selections (
  id uuid PK default gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES venue_bookings(id) ON DELETE CASCADE,
  package_id uuid REFERENCES venue_fb_packages(id),
  package_name text NOT NULL,      -- snapshot at time of selection
  price_per_head_pence bigint NOT NULL,
  head_count integer NOT NULL,
  total_pence bigint GENERATED ALWAYS AS (price_per_head_pence * head_count) STORED,
  special_requirements text,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**Venue-side route:** `src/app/(venue-ops)/fb/page.tsx` — F&B package management

**Package register:**
- Card grid: package name | type | price/head | min heads | active status
- "Add Package" button
- Edit/Archive per package

**Booking F&B tab (within booking detail):**
- "Add F&B Selection" → select from package list → confirm head count
- Running total of all F&B selections
- Special dietary requirements / notes section
- Total F&B value auto-added to booking total

---

### Step 81 — Venue-Side BEO Generation

**What:** The venue generates their own internal BEO — the operating document sent to kitchen, floor management, and F&B team. Different from the planner's BEO (Step 37) — this is the venue-internal version.

**Route:** `src/app/(venue-ops)/bookings/[bookingId]/beo/page.tsx`

**Venue BEO sections:**

1. **Header:** VENUE BANQUET EVENT ORDER | Booking ref | Generated date
2. **Booking Summary:** Space, event name, client, event date, setup time, event start/end, breakdown time
3. **Guest Summary:** Total guests, guest count by meal if applicable
4. **F&B Schedule:**
   - Each selected F&B package: package name, head count, serving time, price
   - Special dietary requirements table
   - Service style (plated / buffet / canapé / cocktail)
5. **Room Setup:** Layout type, chair style, table configuration (links to floor plan if one exists)
6. **AV & Technical:** What's included, setup requirements, external suppliers
7. **Staffing Schedule:** Each assigned staff member, role, shift start/end
8. **Client Contact:** Name, mobile, email
9. **Internal Notes:** Any special instructions for the team

**Print/PDF:** Same browser-print approach as Step 37.

**"Share with Kitchen" button:** Generates a read-only URL for the BEO (same token pattern as floor plan share).

---

### Step 82 — Venue Staff Scheduling

**What:** The venue assigns its own staff to each booking. Different from the agency team scheduling (Level 12) — these are venue employees (Venue Manager, Head Chef, Floor Manager, AV Tech, etc.).

**New DB table:**
```sql
venue_staff_assignments (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  booking_id uuid NOT NULL REFERENCES venue_bookings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),  -- if staff have Gala Dock accounts
  staff_name text NOT NULL,                -- fallback if no user account
  staff_role text NOT NULL,
    -- values: venue-manager | head-chef | sous-chef | floor-manager | av-technician | bar-manager | server | porter | security | other
  shift_start timestamptz NOT NULL,
  shift_end timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**UI — Booking Detail → Staffing tab:**
- Staff schedule table: Name | Role | Shift Start | Shift End | Duration (auto-calculated)
- "Add Staff Member" → inline form
- Total staff hours summary
- "Add all to BEO" → includes in the BEO auto-generation (Step 81)

**Staff hours calculation:** `(shift_end - shift_start)` for each row. Total hours shown at bottom.

---

### Step 83 — Venue-Facing Client Portal

**What:** The event planner who booked the venue gets a client portal to view their booking, sign the hire agreement, pay the deposit, and communicate with the venue.

**Route:** `src/app/venue-portal/[token]/page.tsx`  
Add `/venue-portal` to proxy.ts PUBLIC_PREFIXES.

**Portal layout:** Clean, venue-branded (venue logo if uploaded, otherwise Gala Dock).

**Portal tabs:**

*Booking Summary:*
- Booking reference, event name, space, date, times
- Status badge + status explanation ("Your booking is provisional — please sign the hire agreement below to confirm")
- Venue contact card

*Hire Agreement:*
- Document preview (uploaded hire agreement PDF from venue_documents)
- E-sign section (same checkbox + typed name approach from Step 16)
- Once signed: "Agreement signed on [date] by [name] — your booking is now provisional/confirmed."

*Payment:*
- Total booking value breakdown (hire fee + F&B selections)
- Payment schedule (if set by venue)
- Stripe payment link (if configured — same optional stub as Step 38)
- Bank transfer details (if venue uses bank transfer)

*Floor Plan:*
- Read-only view of venue's floor plan for the event (if shared by venue)

*Messages:*
- Thread of all communications between planner and venue for this booking
- Compose + send (→ inserts into `venue_booking_communications`)

**Activate portal flow (in venue-side booking detail):**
"Share Portal with Client" button → generates `portal_token` → shows shareable URL → copy button.

---

### Step 84 — Dual-Sided Sync (Agency ↔ Venue)

**What:** The connection between the agency-side Gala Dock and the venue-side Gala Dock. When an event planner books a venue that also uses Gala Dock, the booking appears on both sides.

**How it works:**

When a planner creates a booking enquiry via the Venue CRM (Option A — Step 51):
- If the selected venue has `workspace_id` set (i.e. they have a Gala Dock venue account), offer: "This venue uses Gala Dock — send your booking enquiry directly?"
- On confirm: INSERT into `venue_bookings` on the **venue's** workspace with `linked_planner_event_id` and `linked_workspace_id`
- The venue sees the enquiry immediately in their Bookings register

When the venue confirms the booking:
- The planner's event detail (on their agency account) updates the venue status to "Confirmed by venue"
- A communication is logged on the event Comms tab: "Venue confirmed your booking for [event name]"

**This is a V2 refinement** — for V1, the two sides operate independently (planner uses their Venue CRM, venue uses their Venue Ops). The sync feature is an enhancement that activates when both parties are on the platform.

**Implementation note:** Uses the same Supabase service-role client (server-only) to write across workspace boundaries. Never exposed to the browser. Only triggered via a server action.

---

### Step 85 — Multi-Venue Dashboard + Occupancy Reports

**What:** For hotel groups and venue management companies with multiple properties, a single dashboard showing all venues' performance.

**Route:** `src/app/(venue-ops)/home/page.tsx`

**Venue-side home KPI strip:**
- Bookings This Month (all spaces, all venues)
- Revenue This Month (total booking value from confirmed bookings)
- Occupancy Rate (booked days ÷ total available days × 100%)
- Enquiries Pending (status = enquiry or hold)

**Venue-side Reports (`/venue-ops/reports`):**

*Occupancy Report:*
- Per-space occupancy rate (CSSBarChart — horizontal bars)
- Busiest months (12-month trend)
- Peak day of week

*Revenue Report:*
- Monthly revenue by space
- Revenue split: hire fees vs F&B vs extras
- Top 5 booking clients by spend

*Bookings Report:*
- Bookings by event type (Wedding / Corporate / Private / Conference)
- Conversion rate (enquiry → confirmed)
- Average booking value
- Cancellation rate + reasons

*Staff Utilisation:*
- Total staff hours per month
- Hours per staff role
- Busiest periods for staffing

**Venue-side Activity Feed:**
- Real-time feed of all booking events: new enquiries, status changes, agreements signed, payments received

---

---

## LEVEL 15 — FINAL FEATURE LAYER

*Target: The 7 features that separate "great" from "best in market" — mood boards, QR check-in, expense tracking, supplier contracts, milestone countdown, white-label portal, PWA offline mode.*

---

### Step 91 — Mood Board DB Schema + Types

**What:** A visual inspiration board per event where the planner and client collaboratively upload images, colour swatches, and notes. Aisle Planner's most-praised and highest-retention feature. Simple to build — image grid stored as JSON, drag-to-reorder with sort_order.

**New DB tables:**
```sql
event_mood_boards (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid NOT NULL UNIQUE,   -- one board per event
  title text NOT NULL DEFAULT 'Mood Board',
  colour_palette jsonb NOT NULL DEFAULT '[]',
    -- [{hex: "#4F46E5", name: "Brand Indigo"}, ...]
  notes text,
  share_token text UNIQUE,         -- read-only share link for client
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)

mood_board_items (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  mood_board_id uuid NOT NULL REFERENCES event_mood_boards(id) ON DELETE CASCADE,
  item_type text NOT NULL DEFAULT 'image',
    -- values: image | colour-swatch | text-note
  storage_key text,        -- Supabase Storage key (for images)
  colour_hex text,         -- for colour-swatch items
  text_content text,       -- for text-note items
  caption text,            -- label under image or swatch
  sort_order integer NOT NULL DEFAULT 0,
  width_units integer NOT NULL DEFAULT 1,   -- 1, 2, or 3 (grid column span)
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**TypeScript types:**
```typescript
export type MoodBoardItemType = "image" | "colour-swatch" | "text-note";

export interface EventMoodBoard {
  id: string; workspace_id: string; event_id: string;
  title: string;
  colour_palette: { hex: string; name: string }[];
  notes: string | null; share_token: string | null;
  created_at: string; updated_at: string;
}

export interface MoodBoardItem {
  id: string; workspace_id: string; mood_board_id: string;
  item_type: MoodBoardItemType;
  storage_key: string | null; colour_hex: string | null;
  text_content: string | null; caption: string | null;
  sort_order: number; width_units: 1 | 2 | 3;
  created_by: string | null; created_at: string;
}
```

**Add to Step 1 DB migration section.**

---

### Step 92 — Mood Board Tab + Canvas UI

**What:** "Mood Board" appears as a tab in the event detail page. A masonry-style image grid with upload, drag-to-reorder, and colour palette management.

**Event detail tab addition:**
```typescript
{ id: "moodboard", label: "Mood Board" }
```

**Tab layout — two sections:**

*Colour Palette strip (top):*
Row of colour swatches from `colour_palette` JSON. Each swatch: coloured circle + hex label.
"Add Colour" button → opens a colour picker (`<input type="color">` — no library, built into every browser) + optional name input. Saves to `colour_palette` JSON array.
Remove swatch: X on hover.

*Image Grid (main area):*
Masonry/CSS grid layout. Each item renders based on `item_type`:

- **image:** `<img>` from signed Supabase Storage URL. On hover: caption overlay + drag handle + delete button + width toggle (1/2/3 columns).
- **colour-swatch:** Large coloured square with hex label and name.
- **text-note:** Card with text content (styled like a sticky note — `bg-warning-50`).

**Upload:** `<label><input type="file" accept="image/*" multiple className="hidden" /></label>` — multiple images at once. Each uploaded to `mood-boards/[moodBoardId]/[filename]` in Supabase Storage. Insert `mood_board_items` row per file.

**Add Text Note:** Button → inline form (textarea, 3 lines max for short note). INSERT with `item_type = 'text-note'`.

**Drag to reorder:** HTML5 `draggable` on each item + `ondragover`/`ondrop` handlers updating `sort_order`. Debounced batch UPDATE. Same approach as kanban board (Level 2).

**Width toggle:** "Expand" icon on each image — cycles through 1→2→3 column span. Updates `width_units`. CSS Grid handles layout: `grid-template-columns: repeat(3, 1fr)`. Items with `width_units: 2` span 2 columns via `grid-column: span 2`.

**Empty state:** "Start building your vision board. Upload inspiration images, add colours and notes." with an Upload CTA.

---

### Step 93 — Mood Board Client Share + Portal Integration

**What:** Share the mood board with the client (read-only link). Client can view and comment. Feeds into the client portal.

**Share button (mood board header):**
"Share with Client" → generates `share_token` → shows URL: `/mood-board/[token]`

**Public route:** `src/app/mood-board/[token]/page.tsx`
Add `/mood-board` to proxy.ts PUBLIC_PREFIXES.

**Public mood board page:**
- Clean layout, workspace logo
- Event name + "Mood Board" heading
- Read-only image grid (same layout, no controls)
- Colour palette strip
- "This board was prepared by [workspace name]" footer
- No editing, no deletion — view only

**Client portal integration (Step 43 update):**
Add a "Mood Board" tab to the client portal (`/portal/[token]`) that embeds the mood board in read-only mode. Shows a link to open the full board.

**Seed data (Carter Wedding mood board):**
Pre-populate 6 images (placeholder gradient divs if real images not available) + 3 colour swatches:
```
Colours: #2D1B5E (Deep Plum) | #C9A96E (Champagne Gold) | #F5F0E8 (Ivory Cream)
Text note: "Elegant, romantic, candlelit atmosphere. Think Thornbury Castle in winter."
```

---

### Step 94 — Guest Check-In DB Schema + QR Code Generation

**What:** Each guest gets a unique QR code. Scanning it on event day marks them as arrived in real time. No app required — mobile browser camera.

**DB changes:**
```sql
-- Add to event_guests table (from Step 19):
ALTER TABLE event_guests ADD COLUMN check_in_token text UNIQUE;
  -- UUID generated on first access, used in QR code URL
ALTER TABLE event_guests ADD COLUMN checked_in_at timestamptz;
ALTER TABLE event_guests ADD COLUMN checked_in_by uuid REFERENCES auth.users(id);
```

**TypeScript type update:**
```typescript
// Add to EventGuest interface:
check_in_token: string | null;
checked_in_at: string | null;
checked_in_by: string | null;
```

**QR code generation:**
Use the `qrcode` npm package (MIT license, zero cost):
```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

Each guest's QR code encodes: `https://yourdomain.com/check-in/[check_in_token]`

**QR generation in Guests tab:**
- "Generate QR Codes" button in the Guests tab header → batch-generates `check_in_token` for all guests that don't have one (UUID per guest, saved to DB)
- Each guest row gains a "QR" icon button → click shows their individual QR code in a modal
- "Print All QR Codes" → print-optimised page: grid of QR codes, one per guest, with name + table number label below. Perfect for printing name badges.

**New route for QR badge print page:** `src/app/(app)/events/[eventId]/guests/print-qr/page.tsx`

**Public check-in route:**
```
src/app/check-in/[token]/page.tsx
```
Add `/check-in` to proxy.ts PUBLIC_PREFIXES.

**Check-in page behaviour:**
- No auth required
- Looks up `event_guests` by `check_in_token`
- If found and not yet checked in: shows guest name + "Tap to Check In" button
- On tap: UPDATE `checked_in_at = now()`, `rsvp_status = 'confirmed'`
- Shows: "✓ Welcome, [Name]! You're checked in." with event name
- If already checked in: "Already checked in at [time]"
- If token invalid: "QR code not recognised. Please see the event team."

---

### Step 95 — QR Arrival Scanner (Mobile Browser)

**What:** A scanner page for the event team's phone. Point camera at a guest's QR code → guest is instantly checked in. No dedicated app — just a browser tab.

**Route:** `src/app/(app)/events/[eventId]/guests/scan/page.tsx`

**Scanner UI:**
- Full-screen camera viewport (mobile-optimised)
- Green overlay rectangle showing the scan zone
- "Scanning for QR code..." pulsing label
- When detected: flash green + plays success sound (short beep via Web Audio API) + shows guest name card for 2 seconds

**Implementation using `@zxing/browser` (Apache 2.0, free):**
```typescript
import { BrowserQRCodeReader } from "@zxing/browser";

const codeReader = new BrowserQRCodeReader();
// continuous scan — calls callback on each decoded result
codeReader.decodeFromVideoDevice(null, videoRef.current, (result) => {
  if (result) handleCheckIn(result.getText());
});
```

**Or native BarcodeDetector API** (no library, supported in Chrome/Edge/Android):
```typescript
const detector = new BarcodeDetector({ formats: ["qr_code"] });
// requestAnimationFrame loop scanning each video frame
```

**On successful scan:**
1. Parse the check-in URL from QR content → extract token
2. Call Supabase UPDATE via server action: `check_in_token = [token]` → sets `checked_in_at`
3. Show: large card — "✓ [Guest Name] — Table [X]" + dietary flag if any
4. Auto-dismiss after 3 seconds, return to scanning

**Scan history panel (collapsible at bottom of scanner page):**
Last 10 check-ins in reverse order: "[Name] — 14:32" — gives the team a quick audit.

**Entry in Guests tab:** "Scan Check-In" button in the Guests tab header → opens scanner.

---

### Step 96 — Event Day Mode Arrival Counter

**What:** The Event Day Mode live screen (`/events/[eventId]/event-day`) shows a real-time arrival counter.

**Event Day Mode additions:**

*Arrivals panel (new right-rail section):*
```
GUEST ARRIVALS
──────────────────
  68 / 120 confirmed
  ████████░░░░░ 57%

  [Live] updating...

  [Open Scanner]
```

- Count of guests where `checked_in_at IS NOT NULL` ÷ total confirmed guests × 100%
- Animated progress bar
- Supabase Realtime subscription on `event_guests` table for this event — increments counter when `checked_in_at` updates without page reload
- "Open Scanner" → navigates to `/events/[eventId]/guests/scan`

**Supabase Realtime subscription:**
```typescript
supabase
  .channel(`guests-${eventId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'event_guests',
    filter: `event_id=eq.${eventId}`
  }, (payload) => {
    if (payload.new.checked_in_at) setArrivedCount(c => c + 1);
  })
  .subscribe();
```

This makes Event Day Mode genuinely live — the whole team can see arrivals in real time from different devices.

---

### Step 97 — Expense Tracking DB Schema + Types

**What:** Track actual money spent on an event. Receipts uploaded. Budget vs Actual view. This is what makes the P&L Margin figure real — currently it can only be estimated from quotes, not from actual spend.

**New DB tables:**
```sql
event_expenses (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid NOT NULL,
  category text NOT NULL,
    -- values: venue-hire | catering | av-tech | photography | floristry
    --         entertainment | staffing | transport | stationery | accommodation
    --         insurance | licences | miscellaneous
  description text NOT NULL,
  amount_pence bigint NOT NULL,
  supplier_id uuid,          -- optional link to supplier
  receipt_path text,         -- Supabase Storage key for receipt image/PDF
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  paid_by_name text,         -- name of team member who paid
  paid_by_user_id uuid REFERENCES auth.users(id),
  reimbursed boolean NOT NULL DEFAULT false,
  reimbursed_at timestamptz,
  notes text,
  status text NOT NULL DEFAULT 'recorded',
    -- values: recorded | approved | reimbursed
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)

event_budgets (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_id uuid NOT NULL UNIQUE,
  total_budget_pence bigint NOT NULL DEFAULT 0,
  allocations jsonb NOT NULL DEFAULT '{}',
    -- {"venue-hire": 380000, "catering": 520000, "av-tech": 120000, ...}
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

**TypeScript types:**
```typescript
export type ExpenseCategory =
  | "venue-hire" | "catering" | "av-tech" | "photography" | "floristry"
  | "entertainment" | "staffing" | "transport" | "stationery" | "accommodation"
  | "insurance" | "licences" | "miscellaneous";

export type ExpenseStatus = "recorded" | "approved" | "reimbursed";

export interface EventExpense {
  id: string; workspace_id: string; event_id: string;
  category: ExpenseCategory; description: string;
  amount_pence: number; supplier_id: string | null;
  receipt_path: string | null; expense_date: string;
  paid_by_name: string | null; paid_by_user_id: string | null;
  reimbursed: boolean; reimbursed_at: string | null;
  notes: string | null; status: ExpenseStatus;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface EventBudget {
  id: string; workspace_id: string; event_id: string;
  total_budget_pence: number; allocations: Record<ExpenseCategory, number>;
  currency: string; notes: string | null;
  created_at: string; updated_at: string;
}
```

**Seed data for Carter Wedding:**
```
1. Thornbury Castle hire         | venue-hire    | £3,800 | 01 Jun 2026 | receipt uploaded
2. Noble Kitchen Co. catering    | catering      | £4,200 | 14 Jun 2026 | pending
3. Sound & Vision AV             | av-tech       | £1,200 | 14 Jun 2026 | receipt uploaded
4. Florals by Hannah             | floristry     | £980   | 14 Jun 2026 | pending
5. Second shooter fee            | photography   | £350   | 14 Jun 2026 | recorded
```

Budget allocations: Venue: £4,000 | Catering: £4,500 | AV: £1,500 | Floristry: £1,000 | Photo: £500 | Other: £700

---

### Step 98 — Expense Register UI + Budget vs Actual

**What:** A new "Expenses" tab in the event detail Finance section + a Budget vs Actual view that shows how actual spend compares to allocated budget.

**Event detail → Finance tab → add "Expenses" sub-section:**
(Alternatively add as its own tab — "Expenses" — adjacent to Finance on event detail)

**Expense log table:**
| Date | Category | Description | Amount | Paid By | Receipt | Status | Actions |
|---|---|---|---|---|---|---|---|
| 01 Jun | Venue Hire | Thornbury Castle | £3,800 | Nina | 📎 | Approved | Edit, Delete |

**"Add Expense" button:** Opens inline form:
- Date, Category (select), Description, Amount (£)
- Paid By (select from team members or free text)
- Receipt upload: `<label><input type="file" accept="image/*,.pdf" className="hidden" /></label>`
- Notes

**Total actual spend:** Sum of all expense amounts, shown prominently.

**Budget vs Actual panel:**
Horizontal progress bars per category:
```
Venue Hire      ████████████░░░  £3,800 / £4,000  (95%)
Catering        ████████████████ £4,200 / £4,500  (93%)
AV & Tech       ████████░░░░░░░  £1,200 / £1,500  (80%)
Floristry       █████████░░░░░░  £980   / £1,000  (98%)  ⚠ Near limit
Photography     ████████░░░░░░░  £350   / £500    (70%)
───────────────────────────────────────────────────────
Total           ████████████░░░  £10,530 / £12,200 (86%)
```

Bar turns amber at 85% of budget. Red at 100%+.

**Integration with P&L / Finance:**
The Finance tab "Profit" calculation is updated: instead of (invoice total − quote total), it becomes (invoice total − actual expenses total). This is the real gross margin. If expenses haven't been logged, it falls back to the quote-based estimate with a "(estimated)" label.

**Global expense register:**
Also accessible from Finance (`/app/finance`) as a new "Expenses" tab alongside Quotes/Invoices/Payments/Profit. Shows all expenses across all events. Filter by category, date range, event. Export to CSV.

---

### Step 99 — Supplier Contracts (Post-Quote E-Sign)

**What:** Once a supplier quote is accepted, the planner sends a supplier booking confirmation / contract to the supplier for signature. Same e-sign approach as proposals (Step 16) — checkbox + typed name, legally valid in UK. Closes the full supplier loop: RFQ → Quote → Contract → Signed.

**New DB table:**
```sql
supplier_contracts (
  id uuid PK default gen_random_uuid(),
  workspace_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  event_id uuid,
  quote_id uuid,           -- the accepted quote this derives from
  title text NOT NULL,     -- "Noble Kitchen Co. — Carter Wedding Catering Contract"
  contract_body text,      -- contract terms (from template or custom)
  status text NOT NULL DEFAULT 'draft',
    -- values: draft | sent | viewed | signed | expired | cancelled
  valid_until date,
  share_token text UNIQUE, -- public URL for supplier to sign
  signed_by_name text,
  signed_at timestamptz,
  signed_ip text,
  viewed_at timestamptz,
  deleted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

**TypeScript type:**
```typescript
export type SupplierContractStatus = "draft" | "sent" | "viewed" | "signed" | "expired" | "cancelled";
export interface SupplierContract {
  id: string; workspace_id: string; supplier_id: string;
  event_id: string | null; quote_id: string | null;
  title: string; contract_body: string | null; status: SupplierContractStatus;
  valid_until: string | null; share_token: string | null;
  signed_by_name: string | null; signed_at: string | null; signed_ip: string | null;
  viewed_at: string | null; deleted_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
```

**UI — Supplier Detail → new "Contracts" tab:**
- Contracts table: title | event | status badge | signed date | actions
- "New Contract" button

**"New Contract" flow:**
- Pre-fill title from: "[Supplier Name] — [Event Name] Contract"
- Body: editable textarea (or select from a "Contract Templates" library — see below)
- Valid until date
- "Send to Supplier" → generates `share_token` → sets status = 'sent'

**Default contract template (pre-loaded text):**
```
SUPPLIER BOOKING CONFIRMATION

This agreement confirms the booking of [Supplier Name] for [Event Name] on [Event Date].

Services Agreed:
[Services from linked quote, auto-populated]

Payment Terms:
[From quote / proposal]

Cancellation Policy:
In the event of cancellation by the client with less than 30 days' notice, 50% of the agreed fee is payable. With less than 14 days' notice, 100% is payable.

Special Requirements:
[Free text field]

By signing below, both parties agree to the terms stated in this document.
```

**Contract signing page:** `src/app/supplier-contract/[token]/page.tsx`
Add `/supplier-contract` to proxy.ts PUBLIC_PREFIXES.

Identical flow to the proposal signing page (Step 16) — checkbox + typed name + "Sign Contract" button. On sign: UPDATE status = 'signed', record name/timestamp/IP.

**Integration with Quote flow:**
When a quote is marked as "Accepted" on the Finance → Quotes page → a prompt appears: "Create a supplier contract for this booking?" → one-click creates a draft contract pre-filled from the quote data.

---

### Step 100 — Event Milestone Countdown Timeline

**What:** A visual countdown timeline on each event showing key deadlines working backwards from the event date. One glance shows what's coming up, what's overdue, and where you are in the delivery journey.

**No new DB table needed** — milestones are generated from the event date and stored as a JSON column or computed client-side from a template. Custom milestones stored as an override JSON.

**DB addition (lightweight):**
```sql
ALTER TABLE events ADD COLUMN milestone_overrides jsonb DEFAULT '[]';
-- [{id, label, days_before, completed, completed_at}]
```

**Standard milestone template (auto-generated from event date):**
```typescript
const MILESTONE_TEMPLATES = [
  { id: "send-proposals",     label: "Send proposals to client",        days_before: 90 },
  { id: "confirm-venue",      label: "Confirm venue booking",           days_before: 60 },
  { id: "confirm-suppliers",  label: "Confirm all supplier bookings",   days_before: 45 },
  { id: "final-headcount",    label: "Final headcount from client",     days_before: 30 },
  { id: "finalise-run-sheet", label: "Finalise run sheet",              days_before: 14 },
  { id: "send-beo",           label: "Send BEO to venue and suppliers", days_before: 7  },
  { id: "confirm-timings",    label: "Confirm timings with team",       days_before: 3  },
  { id: "event-day",          label: "Event Day",                       days_before: 0  },
];
```

Each milestone date = `event_date - days_before`.

**UI — Event Detail Overview tab, new "Milestones" section:**

Horizontal timeline (desktop) or vertical list (mobile):
```
───●─────────────────●───────●─────────────────────●────────────────●──▶
  ✓ Jun 1           ✓ Jun 3  TODAY                ⏳ Jun 30        ⏳ Jul 7
  Send proposals    Confirm  ───────────────────── Final headcount  BEO to venue
                    venue                          ← 18 days away   ← 25 days away
```

**Visual state per milestone:**
- ✅ Past + completed: Green dot, strikethrough label, completed date
- ✅ Past + auto-completed (date passed): Green dot, "Done" (assumes completed if date passed without explicit action)
- ⏳ Upcoming: Brand colour dot, "X days away" label
- 🔴 Overdue: Red dot, "X days overdue" label
- ▶ Today: Pulse animation, "Today" label with current date

**"Mark Complete" action per milestone:** Click milestone → toggle completion status → saves to `milestone_overrides` JSON.

**"Customise Milestones" action:**
- Edit button → opens modal with all milestones listed
- Change labels, adjust days_before, add custom milestones, remove unwanted ones
- "Reset to defaults" button

**Integration with Home Dashboard:**
The home page's "Upcoming Events" card gains a "Next milestone in X days" sub-label per event. Click-through to the event detail milestones section.

---

### Step 101 — White-Label Client Portal (Custom Domain)

**What:** Agency plan feature. The planner's client portal uses the agency's own domain (`portal.youragency.com`) instead of the Gala Dock domain. Critical for agencies charging £2k–£10k/event who want to appear fully branded.

**DB addition:**
```sql
-- Add to workspace_settings or workspaces table:
ALTER TABLE workspaces ADD COLUMN portal_custom_domain text;
  -- e.g. "portal.infinityevents.co.uk"
ALTER TABLE workspaces ADD COLUMN portal_custom_domain_verified boolean DEFAULT false;
```

**Settings UI — Settings → Branding → new "Client Portal Domain" section:**
```
┌────────────────────────────────────────────────────────────────────┐
│ Custom Portal Domain                          ○ Not configured     │
│                                                                    │
│ portal.youragency.com  [Save]                                     │
│                                                                    │
│ DNS Setup:                                                         │
│ Add a CNAME record pointing to:  portals.galadock.com             │
│                                                                    │
│ Once added, click [Verify DNS] to confirm.                        │
│                                                                    │
│ Status: ● Pending verification                                    │
└────────────────────────────────────────────────────────────────────┘
```

**How it works technically:**

1. Planner sets `portal_custom_domain = "portal.infinityevents.co.uk"` in settings
2. Their DNS: CNAME `portal.infinityevents.co.uk` → `portals.galadock.com`
3. In `proxy.ts` (middleware), check the incoming `host` header:
   ```typescript
   const host = request.headers.get('host') ?? '';
   // If host is not the main galadock.com domain, look up the workspace
   if (!host.includes('galadock.com') && !host.includes('localhost')) {
     // Look up workspace by portal_custom_domain
     // Rewrite the request to /portal/[token] for that workspace
   }
   ```
4. Vercel (or any hosting) handles the domain via their "Custom Domains" feature — or via the `domains` config in Next.js

**Verification:** "Verify DNS" button calls a server action that does a DNS lookup (`dns.resolve()` in Node.js) to confirm the CNAME is pointing to the right place. Sets `portal_custom_domain_verified = true`.

**Fallback:** If custom domain is not verified or not set, portal always works via `galadock.com/portal/[token]` — no client impact.

**Plan tier gate:** Only available on Agency plan (£299/month). In Settings, show the section with a "Upgrade to Agency plan to unlock custom portal domains" lock if on Starter/Growth.

---

### Step 102 — PWA + Offline Event Day Mode

**What:** Gala Dock becomes installable as an app on any phone or desktop. Event Day Mode works offline — critical because event venues frequently have poor WiFi/signal. A Service Worker caches the run sheet for the current day's events.

**Part A — PWA manifest:**

**File:** `public/manifest.json`
```json
{
  "name": "Gala Dock",
  "short_name": "Gala Dock",
  "description": "The Event Delivery OS",
  "start_url": "/app/home",
  "display": "standalone",
  "background_color": "#0e0c27",
  "theme_color": "#4F46E5",
  "orientation": "any",
  "icons": [
    { "src": "/gala-dock-favicon.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/gala-dock-logo.png",    "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/event-day.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" }
  ],
  "categories": ["business", "productivity"]
}
```

**File:** `src/app/layout.tsx` — add manifest link:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#4F46E5" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

**Part B — Service Worker for Offline Event Day:**

**File:** `public/sw.js`
```javascript
const CACHE_VERSION = 'gala-dock-v1';
const EVENT_DAY_ROUTES = ['/app/events', '/_next/static'];

// Install: cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      cache.addAll(['/', '/app/home', '/offline.html'])
    )
  );
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Cache-first for static assets
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  
  // Network-first for everything else, fallback to cache
  event.respondWith(networkFirstWithFallback(event.request));
});

// Message from app: "cache this event for offline"
self.addEventListener('message', (event) => {
  if (event.data.type === 'CACHE_EVENT_DAY') {
    const { eventId } = event.data;
    // Cache the event day route and its data
    caches.open(CACHE_VERSION).then(cache => {
      cache.add(`/app/events/${eventId}/event-day`);
    });
  }
});
```

**Service Worker registration** (`src/app/layout.tsx` or a client component):
```typescript
"use client";
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }
}, []);
```

**"Go Offline" button in Event Day Mode:**
When the planner opens Event Day Mode → a banner at top:
```
📱 Save for offline use? If signal drops during the event, your run sheet will still work.
[Save Offline]  [Dismiss]
```

On click: sends `CACHE_EVENT_DAY` message to the Service Worker → caches the current event's run sheet data.

**Offline page:** `public/offline.html` — minimal HTML page: "You're offline. Your run sheet is available if you cached it before the event." with a link to the last-opened event.

**Install prompt:**
```typescript
// Handle beforeinstallprompt
let deferredPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  setShowInstallBanner(true);
});
```

Show an "Install App" banner in the top nav when `deferredPrompt` is set (Chrome/Edge/Android only — iOS uses "Add to Home Screen" instructions instead).

**iOS install instructions:**
Small modal triggered by a "Add to Home Screen" button in Settings → Account → "Install Gala Dock on your phone":
```
On iPhone/iPad:
1. Tap the Share button (□↑) in Safari
2. Scroll down and tap "Add to Home Screen"
3. Tap "Add"
```

---

## UPDATED BUILD ORDER SUMMARY

```
Week 1:   Level 1 (Foundation) + Level 2 (Leads CRM)
Week 2:   Level 3 (Proposals + E-Sign) + Level 4 (Guest Management)
Week 3:   Level 5 (Reports) + Level 6 (Inbox)
Week 4:   Level 7 (Finance) + Level 8 (Forms + Portal)
Week 5:   Level 9 (Venue CRM) + Level 10 (Polish V1.5)
Week 6:   Level 11 (Supplier Depth)
Week 7:   Level 12 (Team & Staffing)
Week 8:   Level 13 (Floor Plan Builder)
Week 9:   Level 14 Pt.1 (Venue-Side — spaces, calendar, booking lifecycle)
Week 10:  Level 14 Pt.2 (F&B, BEO, staff, venue portal, dual-sync)
Week 11:  Level 15 Pt.1 (Mood Board + Guest QR Check-in)
Week 12:  Level 15 Pt.2 (Expenses + Supplier Contracts + Milestones + PWA)
```

**Final Plan Totals:**

| Metric | Count |
|---|---|
| Build levels | 15 |
| Total steps | 102 |
| New app routes | 50+ pages |
| New public routes | 12 (portal, sign, form fill, check-in, mood board, floor plan, supplier portal, supplier contract, venue portal, BEO share) |
| New DB tables | 34 tables |
| New TypeScript interfaces/types | 60+ |
| New shared UI components | 6 primitives |
| npm packages added | 2 (qrcode MIT, @zxing/browser Apache 2.0) — both free |
| External APIs required | 0 |
| External APIs optional | 8 (all addons, all off by default) |

```
Week 1:   Level 1 (Foundation) + Level 2 (Leads CRM)
Week 2:   Level 3 (Proposals + E-Sign) + Level 4 (Guest Management)
Week 3:   Level 5 (Reports) + Level 6 (Inbox)
Week 4:   Level 7 (Finance) + Level 8 (Forms + Portal)
Week 5:   Level 9 (Venue CRM) + Level 10 (Polish V1.5)
Week 6:   Level 11 (Supplier Depth — RFQ, portal, rate cards, scoring)
Week 7:   Level 12 (Team & Staffing — assignments, scheduling, calendar)
Week 8:   Level 13 (Floor Plan Builder — canvas, elements, guest seating)
Week 9:   Level 14 Pt.1 (Venue-Side — spaces, calendar, booking lifecycle)
Week 10:  Level 14 Pt.2 (F&B, BEO, staff scheduling, client portal, dual-sync)
```

**Full Plan Totals:**

| Metric | Count |
|---|---|
| Build levels | 14 |
| Total steps | 90 |
| New routes (app) | 40+ pages |
| New DB tables | 28 tables |
| New TypeScript interfaces | 45+ types |
| New UI components | 5 primitives |
| External APIs required | 0 |
| External APIs optional | 6 (all addons, all off by default) |

---

## ADDON REGISTER (when to activate)

| Addon | Trigger to activate | Integration | Cost |
|---|---|---|---|
| **Stripe Payments** | Client wants card payments | Stripe Checkout | 1.4% + 20p/transaction. No setup cost. |
| **Email Sending** | Inbox "Send Email" goes live | Resend.com | 3,000 free/month, then $20/50k |
| **SMS Reminders** | Payment/task reminders | Twilio | ~£0.04/SMS, opt-in only |
| **WhatsApp Business** | Clients prefer WhatsApp | Meta Cloud API | ~$0.03–0.08/conversation |
| **Xero Sync** | Accountant integration | Xero API | Free to connect |
| **AI Proposal Generator** | Copilot generates proposals | Anthropic API (existing) | ~$0.003/1k tokens |
| **AI Natural Language Q&A** | "What's overdue for Carter?" | Anthropic API (existing) | Same as above |
| **Calendar Sync** | Two-way iCal / Google Calendar | iCal standard (free) / Google API | Free |

---

*Document: `docs/plans/FEATURE_BUILD_PLAN.md`*  
*Status: Full 90-step plan — approved for build*
