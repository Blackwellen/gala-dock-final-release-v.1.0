import Link from "next/link";

export interface JobRow {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "In review",
  done: "Completed",
  cancelled: "Cancelled",
};

export function JobsList({ jobs }: { jobs: JobRow[] }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white divide-y divide-surface-100">
      {jobs.map((j) => (
        <Link
          key={j.id}
          href={`/event-manager/tasks/${j.id}`}
          className="flex items-center justify-between px-4 py-3 hover:bg-surface-50"
        >
          <span className="text-sm text-surface-800 truncate">{j.title}</span>
          <span className="text-xs text-surface-400 shrink-0 ml-3">
            {STATUS_LABEL[j.status] ?? j.status}
          </span>
        </Link>
      ))}
    </div>
  );
}
