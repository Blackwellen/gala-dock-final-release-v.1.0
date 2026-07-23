/**
 * Shared, serialisable types passed from the Supplier Payments server page
 * down to its client components. Kept separate from `actions.ts` (which is a
 * "use server" module and may only export async functions) and from
 * `page.tsx` so both the list page and the create-bill form can import them.
 */

export interface SupplierBillRow {
  id: string;
  billNumber: string | null;
  supplierId: string;
  supplierName: string;
  eventId: string;
  eventName: string;
  category: string;
  expenseDate: string | null;
  dueDate: string | null;
  amountCents: number;
  paidCents: number;
  currency: string;
  approvalStatus: string;
  paymentStatus: string;
  ownerName: string;
}

export interface SupplierPaymentsKpis {
  outstandingCents: number;
  approvedToPayCents: number;
  paidThisMonthCents: number;
  overdueCents: number;
  /** Average days between due date and payment date for paid bills, or null if no data. */
  avgPaymentDays: number | null;
}

export interface AgingBucket {
  key: string;
  label: string;
  color: string;
  cents: number;
}

export interface CategorySlice {
  label: string;
  value: number;
  color: string;
}

export interface UpcomingPayout {
  id: string;
  supplierName: string;
  eventName: string;
  dueDate: string | null;
  balanceCents: number;
}

export interface ApprovalBottleneck {
  label: string;
  count: number;
}

export interface FilterOption {
  id: string;
  name: string;
}

export interface SupplierPaymentsInsights {
  aging: AgingBucket[];
  agingTotalCents: number;
  categoryBreakdown: CategorySlice[];
  upcomingPayouts: UpcomingPayout[];
  bottlenecks: ApprovalBottleneck[];
  /** Whether bottlenecks are grouped by owner or, when owner attribution is thin, by approval stage. */
  bottlenecksBy: "owner" | "stage";
}
