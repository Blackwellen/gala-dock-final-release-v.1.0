"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceManager } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { safeGenerateAndUpload, generatePayrollExportCsv } from "../_lib/documents";
import { r2PresignedGet } from "@/lib/storage/r2";

/**
 * Server actions for the Wages & Hours tab. Wage data is sensitive — every
 * mutation here requires an owner/admin/manager workspace role (mirroring the
 * RLS SELECT policy already on `timesheets`/`payroll_exports`) and re-derives
 * the workspace/user from the session rather than trusting client input.
 */

/** regular_hours = actual_hours - overtime_hours; overtime is paid at overtime_rate_cents. */
function timesheetCostCents(t: {
  actual_hours: number;
  overtime_hours: number;
  hourly_rate_cents: number;
  overtime_rate_cents: number;
}): number {
  const regularHours = Math.max(0, t.actual_hours - t.overtime_hours);
  return Math.round(regularHours * t.hourly_rate_cents + t.overtime_hours * t.overtime_rate_cents);
}

export async function approveTimesheet(timesheetId: string): Promise<void> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("timesheets")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", timesheetId)
    .maybeSingle();
  if (!existing) throw new Error("Timesheet not found");

  const { error } = await supabase
    .from("timesheets")
    .update({
      approval_status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", timesheetId);

  if (error) throw new Error(error.message || "Failed to approve timesheet");

  revalidatePath("/event-manager/finance/wages-hours");
}

export async function rejectTimesheet(timesheetId: string): Promise<void> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("timesheets")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", timesheetId)
    .maybeSingle();
  if (!existing) throw new Error("Timesheet not found");

  const { error } = await supabase
    .from("timesheets")
    .update({
      approval_status: "rejected",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", timesheetId);

  if (error) throw new Error(error.message || "Failed to reject timesheet");

  revalidatePath("/event-manager/finance/wages-hours");
}

export interface RunPayrollResult {
  exportId: string;
  timesheetCount: number;
  totalCents: number;
  currency: string;
  payPeriodStart: string;
  payPeriodEnd: string;
}

/**
 * IMPORTANT — honesty requirement: there is no payroll provider integration
 * (Xero/Gusto/etc payroll API) wired anywhere in this codebase. This action
 * does NOT submit payroll or move any real money. It creates a real, local
 * `payroll_exports` snapshot row (a genuinely useful export/audit record of
 * "what is owed") from every currently `approved` timesheet, and flips those
 * timesheets to `exported` so they aren't double-counted next run. The UI
 * must present the resulting state as "Exported — no payroll provider
 * connected", never as "paid".
 */
export async function runPayroll(): Promise<RunPayrollResult> {
  const { workspaceId, user } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: approved, error: fetchError } = await supabase
    .from("timesheets")
    .select(
      "id, event_id, team_member_name, role, actual_hours, overtime_hours, hourly_rate_cents, overtime_rate_cents, currency, pay_period_start, pay_period_end"
    )
    .eq("workspace_id", workspaceId)
    .eq("approval_status", "approved");

  if (fetchError) throw new Error(fetchError.message || "Failed to load approved timesheets");
  if (!approved || approved.length === 0) {
    throw new Error("No approved timesheets are ready for a payroll export.");
  }

  const totalCents = approved.reduce((s, t) => s + timesheetCostCents(t), 0);
  const currency = approved[0].currency || "GBP";
  const payPeriodStart = approved.reduce(
    (min, t) => (t.pay_period_start < min ? t.pay_period_start : min),
    approved[0].pay_period_start
  );
  const payPeriodEnd = approved.reduce(
    (max, t) => (t.pay_period_end > max ? t.pay_period_end : max),
    approved[0].pay_period_end
  );
  const timesheetIds = approved.map((t) => t.id);

  const { data: exportRow, error: insertError } = await supabase
    .from("payroll_exports")
    .insert({
      workspace_id: workspaceId,
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      total_cents: totalCents,
      currency,
      timesheet_ids: timesheetIds,
      status: "exported",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !exportRow) {
    throw new Error(insertError?.message || "Failed to create payroll export");
  }

  // Generate a real CSV export document and store it in R2 (soft-fails — a
  // missing/failed document must never roll back the payroll export record
  // that was just created above).
  const { data: eventRows } = await supabase
    .from("events")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .in("id", [...new Set(approved.map((t) => t.event_id))]);
  const eventNames = new Map((eventRows ?? []).map((e) => [e.id, e.name]));

  const csv = generatePayrollExportCsv({
    exportId: exportRow.id,
    payPeriodStart,
    payPeriodEnd,
    currency,
    rows: approved.map((t) => ({
      timesheetId: t.id,
      teamMemberName: t.team_member_name,
      role: t.role,
      eventName: eventNames.get(t.event_id) ?? "Unknown event",
      regularHours: Math.max(0, t.actual_hours - t.overtime_hours),
      overtimeHours: t.overtime_hours,
      hourlyRateCents: t.hourly_rate_cents,
      overtimeRateCents: t.overtime_rate_cents,
      costCents: timesheetCostCents(t),
    })),
  });

  const storageKey = await safeGenerateAndUpload({
    workspaceId,
    kind: "payroll-export",
    recordId: exportRow.id,
    filename: `payroll-export-${payPeriodStart}-to-${payPeriodEnd}.csv`,
    contentType: "text/csv",
    body: csv,
  });

  if (storageKey) {
    await supabase
      .from("payroll_exports")
      .update({ storage_key: storageKey })
      .eq("id", exportRow.id)
      .eq("workspace_id", workspaceId);
  }

  const { error: updateError } = await supabase
    .from("timesheets")
    .update({ approval_status: "exported" })
    .eq("workspace_id", workspaceId)
    .in("id", timesheetIds);

  if (updateError) {
    // The export record was created (real and auditable) even though the
    // follow-up status update failed — surface this clearly rather than
    // silently losing the flag flip.
    throw new Error(
      `Payroll export ${exportRow.id} was created, but marking timesheets as exported failed: ${updateError.message}`
    );
  }

  revalidatePath("/event-manager/finance/wages-hours");

  return {
    exportId: exportRow.id,
    timesheetCount: timesheetIds.length,
    totalCents,
    currency,
    payPeriodStart,
    payPeriodEnd,
  };
}

/** Signed, time-limited download link for a payroll export's generated CSV.
 *  Returns null if the export has no stored document (R2 not configured when
 *  it was created) rather than throwing — the caller shows a clear message. */
export async function getPayrollExportDownloadUrl(exportId: string): Promise<string | null> {
  const { workspaceId } = await requireWorkspaceManager();
  const supabase = await createClient();

  const { data: exportRow } = await supabase
    .from("payroll_exports")
    .select("storage_key")
    .eq("id", exportId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!exportRow?.storage_key) return null;
  return r2PresignedGet({ key: exportRow.storage_key });
}
