import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { CSSBarChart } from "@/components/ui/CSSBarChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportCard } from "../components";
import type { TeamData } from "../data";

export function TeamTab({ data }: { data: TeamData }) {
  if (!data.hasData) {
    return (
      <EmptyState
        title="No team workload data yet"
        description="Workload analytics populate once tasks are assigned to team members."
      />
    );
  }

  const hasTaskData = data.tasksByStatus.some((t) => t.value > 0);

  return (
    <div className="space-y-6">
      {data.totalOverdue > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-danger-600 shrink-0" strokeWidth={1.8} />
            <p className="text-sm font-medium text-danger-700">
              {data.totalOverdue} task{data.totalOverdue === 1 ? "" : "s"} overdue across the team.
            </p>
          </div>
          <Link
            href="/tasks"
            className="text-sm font-medium text-danger-700 hover:text-danger-800 underline shrink-0"
          >
            View overdue tasks
          </Link>
        </div>
      )}

      <ReportCard title="Tasks by Status">
        {hasTaskData ? (
          <CSSBarChart
            data={data.tasksByStatus.map((t) => ({
              label: t.label,
              value: t.value,
              valueLabel: String(t.value),
              color: TASK_COLORS[t.label] ?? "bg-brand-500",
            }))}
            height={200}
          />
        ) : (
          <EmptyState compact title="No tasks recorded yet" />
        )}
      </ReportCard>

      <ReportCard title="Workload by Team Member" subtitle="Tasks assigned, completed and overdue">
        {data.members.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-surface-500 border-b border-surface-100">
                  <th className="pb-2 pr-4">Team Member</th>
                  <th className="pb-2 pr-4 text-right">Events</th>
                  <th className="pb-2 pr-4 text-right">Tasks Assigned</th>
                  <th className="pb-2 pr-4 text-right">Completed</th>
                  <th className="pb-2 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m, i) => (
                  <tr key={`${m.name}-${i}`} className="border-b border-surface-50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-surface-900">{m.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-600">{m.eventsAssigned}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-surface-700">{m.tasksAssigned}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-success-600">{m.tasksCompleted}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {m.tasksOverdue > 0 ? (
                        <span className="text-danger-600 font-semibold">{m.tasksOverdue}</span>
                      ) : (
                        <span className="text-surface-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No team members found" />
        )}
      </ReportCard>
    </div>
  );
}

const TASK_COLORS: Record<string, string> = {
  "Not Started": "bg-surface-400",
  "In Progress": "bg-brand-500",
  Completed: "bg-success-500",
  Overdue: "bg-danger-500",
};
