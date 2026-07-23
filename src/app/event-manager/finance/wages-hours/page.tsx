import Link from "next/link";
import { Clock, Timer, Banknote, AlertTriangle, Calculator, UserX, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import {
  ChartCard,
  GroupedBarChart,
  StackedBarChart,
  InsightsRail,
  InsightCard,
  FinanceFooter,
} from "@/components/ui/FinanceCharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import type { Timesheet } from "@/lib/supabase/types";
import { formatCentsCompact, FINANCE_CHART_COLORS as C } from "../_lib/finance";
import { TimesheetsTable, type TimesheetRow } from "./TimesheetsTable";
import { RunPayrollButton } from "./RunPayrollButton";

export const metadata = { title: "Finance — Wages & Hours" };
export const dynamic = "force-dynamic";

type TimesheetListRow = Pick<
  Timesheet,
  | "id"
  | "event_id"
  | "team_member_name"
  | "role"
  | "department"
  | "pay_period_start"
  | "pay_period_end"
  | "scheduled_hours"
  | "actual_hours"
  | "overtime_hours"
  | "hourly_rate_cents"
  | "overtime_rate_cents"
  | "currency"
  | "approval_status"
  | "approved_at"
  | "created_at"
>;

const DEPARTMENTS = ["production", "operations", "front_of_house", "security", "other"] as const;
const DEPARTMENT_LABELS: Record<string, string> = {
  production: "Production",
  operations: "Operations",
  front_of_house: "Front of House",
  security: "Security",
  other: "Other",
};
const DEPARTMENT_COLORS: Record<string, string> = {
  production: C.brand,
  operations: C.info,
  front_of_house: C.violet,
  security: C.danger,
  other: C.slate,
};

const UNAPPROVED_STATUSES = new Set(["draft", "submitted", "pending"]);

/** regular_hours = actual_hours - overtime_hours; overtime is paid at overtime_rate_cents. */
function timesheetCostCents(t: Pick<TimesheetListRow, "actual_hours" | "overtime_hours" | "hourly_rate_cents" | "overtime_rate_cents">): number {
  const regularHours = Math.max(0, t.actual_hours - t.overtime_hours);
  return Math.round(regularHours * t.hourly_rate_cents + t.overtime_hours * t.overtime_rate_cents);
}

export default async function WagesHoursPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: timesheetData }, { data: eventData }] = await Promise.all([
    supabase
      .from("timesheets")
      .select(
        "id, event_id, team_member_name, role, department, pay_period_start, pay_period_end, scheduled_hours, actual_hours, overtime_hours, hourly_rate_cents, overtime_rate_cents, currency, approval_status, approved_at, created_at"
      )
      .eq("workspace_id", workspaceId)
      .order("pay_period_start", { ascending: false }),
    supabase.from("events").select("id, name").eq("workspace_id", workspaceId),
  ]);

  const timesheets = (timesheetData ?? []) as TimesheetListRow[];
  const eventNames = new Map((eventData ?? []).map((e) => [e.id, e.name]));

  // ---- Synthesized human-friendly timesheet codes (sequential by creation date) ----
  const sortedByCreated = [...timesheets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const codeById = new Map(
    sortedByCreated.map((t, i) => [t.id, `TMS-${new Date(t.created_at).getFullYear()}-${String(i + 1).padStart(4, "0")}`])
  );

  // ---- KPIs ----
  const scheduledHours = timesheets.reduce((s, t) => s + t.scheduled_hours, 0);
  const actualHours = timesheets.reduce((s, t) => s + t.actual_hours, 0);
  const wageCostCents = timesheets.reduce((s, t) => s + timesheetCostCents(t), 0);
  const overtimeCostCents = timesheets.reduce((s, t) => s + t.overtime_hours * t.overtime_rate_cents, 0);
  const avgHourlyCostCents = actualHours > 0 ? wageCostCents / actualHours : 0;
  const unapprovedCount = timesheets.filter((t) => UNAPPROVED_STATUSES.has(t.approval_status)).length;

  // ---- Staffing Cost by Event (top 6) ----
  const costByEvent = new Map<string, number>();
  for (const t of timesheets) {
    costByEvent.set(t.event_id, (costByEvent.get(t.event_id) ?? 0) + timesheetCostCents(t));
  }
  const staffingCostByEvent = [...costByEvent.entries()]
    .map(([eventId, cents]) => ({ label: eventNames.get(eventId) ?? "Unknown", value: cents / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // ---- Hours by Department (top 6 events by actual hours, stacked by department) ----
  const hoursByEvent = new Map<string, number>();
  for (const t of timesheets) hoursByEvent.set(t.event_id, (hoursByEvent.get(t.event_id) ?? 0) + t.actual_hours);
  const topEventIds = [...hoursByEvent.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([eventId]) => eventId);

  const hoursByDepartmentGroups = topEventIds.map((eventId) => {
    const segments = DEPARTMENTS.map((dept) => {
      const value = timesheets
        .filter((t) => t.event_id === eventId && t.department === dept)
        .reduce((s, t) => s + t.actual_hours, 0);
      return { key: dept, label: DEPARTMENT_LABELS[dept], value, color: DEPARTMENT_COLORS[dept] };
    }).filter((seg) => seg.value > 0);
    return { label: eventNames.get(eventId) ?? "Unknown", segments };
  });

  // ---- Payroll Due — approved but not yet exported/paid ----
  const approvedTimesheets = timesheets.filter((t) => t.approval_status === "approved");
  const payrollDueCents = approvedTimesheets.reduce((s, t) => s + timesheetCostCents(t), 0);

  // ---- Top Labour Cost Events (top 5, % of total wage cost) ----
  const topLabourCostEvents = [...costByEvent.entries()]
    .map(([eventId, cents]) => ({
      event: eventNames.get(eventId) ?? "Unknown",
      cents,
      pct: wageCostCents > 0 ? (cents / wageCostCents) * 100 : 0,
    }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);

  // ---- Overtime Alerts (top 5 by overtime cost) ----
  const overtimeAlerts = timesheets
    .filter((t) => t.overtime_hours > 0)
    .map((t) => ({
      id: t.id,
      teamMember: t.team_member_name,
      event: eventNames.get(t.event_id) ?? "Unknown",
      overtimeHours: t.overtime_hours,
      overtimeCents: t.overtime_hours * t.overtime_rate_cents,
    }))
    .sort((a, b) => b.overtimeCents - a.overtimeCents)
    .slice(0, 5);

  // ---- Latest Approvals (5 most recently approved) ----
  const latestApprovals = timesheets
    .filter((t) => t.approval_status === "approved" && t.approved_at)
    .sort((a, b) => (b.approved_at as string).localeCompare(a.approved_at as string))
    .slice(0, 5);

  const timesheetRows: TimesheetRow[] = timesheets.map((t) => ({
    id: t.id,
    code: codeById.get(t.id) ?? t.id.slice(0, 8).toUpperCase(),
    teamMemberName: t.team_member_name,
    role: t.role,
    eventName: eventNames.get(t.event_id) ?? null,
    department: t.department,
    scheduledHours: t.scheduled_hours,
    actualHours: t.actual_hours,
    overtimeHours: t.overtime_hours,
    hourlyRateCents: t.hourly_rate_cents,
    overtimeRateCents: t.overtime_rate_cents,
    costCents: timesheetCostCents(t),
    currency: t.currency,
    approvalStatus: t.approval_status,
    payPeriodStart: t.pay_period_start,
    payPeriodEnd: t.pay_period_end,
  }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Wages & Hours"
        description="Staff timesheets, hours worked and wage cost by event and department"
        actions={
          <Link
            href="/event-manager/finance/wages-hours/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Timesheet
          </Link>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        <KPIGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Scheduled Hours" value={`${scheduledHours.toFixed(0)}h`} icon={Clock} iconColor="text-brand-600" iconBg="bg-brand-50" />
          <MetricCard label="Actual Hours Logged" value={`${actualHours.toFixed(0)}h`} icon={Timer} iconColor="text-info-600" iconBg="bg-info-50" />
          <MetricCard label="Wage Cost" value={formatCentsCompact(wageCostCents)} icon={Banknote} iconColor="text-success-600" iconBg="bg-success-50" />
          <MetricCard label="Overtime Cost" value={formatCentsCompact(overtimeCostCents)} icon={AlertTriangle} iconColor="text-warning-600" iconBg="bg-warning-50" />
          <MetricCard label="Avg Hourly Cost" value={formatCurrency(avgHourlyCostCents / 100)} icon={Calculator} iconColor="text-violet-600" iconBg="bg-violet-50" />
          <MetricCard
            label="Unapproved Timesheets"
            value={unapprovedCount}
            icon={UserX}
            iconColor={unapprovedCount > 0 ? "text-danger-600" : "text-surface-400"}
            iconBg={unapprovedCount > 0 ? "bg-danger-50" : "bg-surface-100"}
          />
        </KPIGrid>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Staffing Cost by Event">
                {staffingCostByEvent.length === 0 ? (
                  <p className="text-xs text-surface-400">No staffing cost data yet.</p>
                ) : (
                  <GroupedBarChart
                    groups={staffingCostByEvent.map((r) => ({ label: r.label, bars: [{ key: "cost", value: r.value, color: C.brand }] }))}
                    height={200}
                    formatValue={(v) => formatCurrency(v)}
                  />
                )}
              </ChartCard>
              <ChartCard title="Hours by Department">
                {hoursByDepartmentGroups.length === 0 || hoursByDepartmentGroups.every((g) => g.segments.length === 0) ? (
                  <p className="text-xs text-surface-400">No hours logged yet.</p>
                ) : (
                  <>
                    <StackedBarChart groups={hoursByDepartmentGroups} height={200} showTotals={false} formatValue={(v) => `${v.toFixed(1)}h`} />
                    <div className="flex flex-wrap gap-3 mt-3">
                      {DEPARTMENTS.map((dept) => (
                        <span key={dept} className="flex items-center gap-1.5 text-[11px] text-surface-500">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DEPARTMENT_COLORS[dept] }} />
                          {DEPARTMENT_LABELS[dept]}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </ChartCard>
            </div>

            <TimesheetsTable timesheets={timesheetRows} />

            <FinanceFooter />
          </div>

          <InsightsRail>
            <InsightCard title="Payroll Due">
              <p className="text-2xl font-bold text-surface-900 tabular-nums">{formatCentsCompact(payrollDueCents)}</p>
              <p className="text-xs text-surface-500 mt-1">
                {approvedTimesheets.length} approved timesheet{approvedTimesheets.length === 1 ? "" : "s"} awaiting a payroll export.
              </p>
              <RunPayrollButton disabled={approvedTimesheets.length === 0} />
            </InsightCard>

            <InsightCard title="Top Labour Cost Events">
              {topLabourCostEvents.length === 0 ? (
                <p className="text-xs text-surface-400">No labour cost recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {topLabourCostEvents.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-surface-600 truncate">{r.event}</span>
                      <span className="font-semibold text-surface-900 tabular-nums shrink-0">
                        {formatCentsCompact(r.cents)}
                        <span className="text-surface-400 font-normal ml-1">({r.pct.toFixed(0)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Overtime Alerts">
              {overtimeAlerts.length === 0 ? (
                <p className="text-xs text-surface-400">No overtime logged right now.</p>
              ) : (
                <ul className="space-y-3">
                  {overtimeAlerts.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning-500 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-surface-800 truncate">{a.teamMember}</span>
                        <span className="flex items-center justify-between text-surface-400">
                          <span className="truncate">{a.event} · {a.overtimeHours.toFixed(1)}h OT</span>
                          <span className="font-semibold tabular-nums text-surface-700 shrink-0 ml-2">
                            {formatCentsCompact(a.overtimeCents)}
                          </span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>

            <InsightCard title="Latest Approvals">
              {latestApprovals.length === 0 ? (
                <p className="text-xs text-surface-400">No timesheets approved yet.</p>
              ) : (
                <ul className="space-y-3">
                  {latestApprovals.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-xs">
                      <Timer className="w-3.5 h-3.5 text-success-500 mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-surface-800 truncate">{t.team_member_name}</span>
                        <span className="flex items-center justify-between text-surface-400">
                          <span className="truncate">{eventNames.get(t.event_id) ?? "Event"}</span>
                          <span className="shrink-0 ml-2">{t.approved_at ? formatDate(t.approved_at) : "—"}</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InsightCard>
          </InsightsRail>
        </div>
      </div>
    </div>
  );
}
