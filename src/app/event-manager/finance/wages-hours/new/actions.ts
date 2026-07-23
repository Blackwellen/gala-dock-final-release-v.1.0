"use server";

import { redirect } from "next/navigation";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export interface NewTimesheetInput {
  eventId: string;
  staffAssignmentId: string | null;
  teamMemberName: string;
  role: string;
  department: string;
  payPeriodStart: string; // yyyy-mm-dd
  payPeriodEnd: string; // yyyy-mm-dd
  scheduledHours: number;
  actualHours: number;
  overtimeHours: number;
  hourlyRate: number; // GBP major units
  overtimeRate: number; // GBP major units
  currency: string;
  notes: string;
}

export async function createTimesheet(input: NewTimesheetInput) {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  if (!input.eventId) throw new Error("Select an event");
  if (!input.teamMemberName.trim()) throw new Error("Team member name is required");
  if (!input.payPeriodStart || !input.payPeriodEnd) throw new Error("Pay period start and end are required");
  if (input.payPeriodEnd < input.payPeriodStart) throw new Error("Pay period end must be on or after the start date");
  if (input.scheduledHours < 0 || input.actualHours < 0 || input.overtimeHours < 0) {
    throw new Error("Hours cannot be negative");
  }
  if (input.overtimeHours > input.actualHours) {
    throw new Error("Overtime hours cannot exceed actual hours");
  }
  if (input.hourlyRate < 0 || input.overtimeRate < 0) {
    throw new Error("Rates cannot be negative");
  }

  // Defence in depth — RLS already scopes these, but confirm ownership before writing.
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", input.eventId)
    .maybeSingle();
  if (!event) throw new Error("Event not found");

  if (input.staffAssignmentId) {
    const { data: assignment } = await supabase
      .from("event_staff_assignments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", input.staffAssignmentId)
      .maybeSingle();
    if (!assignment) throw new Error("Staff assignment not found");
  }

  const { error } = await supabase.from("timesheets").insert({
    workspace_id: workspaceId,
    event_id: input.eventId,
    staff_assignment_id: input.staffAssignmentId,
    team_member_name: input.teamMemberName.trim(),
    role: input.role.trim() || null,
    department: input.department || "other",
    pay_period_start: input.payPeriodStart,
    pay_period_end: input.payPeriodEnd,
    scheduled_hours: input.scheduledHours,
    actual_hours: input.actualHours,
    overtime_hours: input.overtimeHours,
    hourly_rate_cents: Math.round(input.hourlyRate * 100),
    overtime_rate_cents: Math.round(input.overtimeRate * 100),
    currency: input.currency || "GBP",
    approval_status: "submitted",
    notes: input.notes.trim() || null,
    created_by: user.id,
  });

  if (error) {
    throw new Error(error.message || "Failed to create timesheet");
  }

  redirect("/event-manager/finance/wages-hours");
}
