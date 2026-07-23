// Client-safe dashboard range constants. Kept separate from data.ts (which
// imports the server-only Supabase client) so client components like
// PeriodSelector can import RANGE_OPTIONS without pulling server code into
// the browser bundle.

export type DashboardRange = "today" | "week" | "next7" | "month";

export const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "next7", label: "Next 7 days" },
  { value: "month", label: "This month" },
];
