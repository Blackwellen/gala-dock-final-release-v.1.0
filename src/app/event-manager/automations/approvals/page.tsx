import Link from "next/link";
import { Lock, Sparkles, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTabs, AUTOMATIONS_TABS } from "@/components/ui/SectionTabs";
import { getPersonaContext } from "@/lib/flags/context";
import { upgradeMessage } from "@/lib/billing/entitlements";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getApprovalComments } from "@/lib/automations/data";
import { ApprovalsClient, type FullApprovalRow, type CommentRow, type MemberOption } from "./ApprovalsClient";

export const metadata = { title: "Automations — Approvals" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;
const DEFAULT_STATUSES = ["pending", "escalated"];

interface ApprovalsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const { flags } = await getPersonaContext();

  if (!flags.automationsBuilder) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Automations" tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />} />
        <div className="max-w-lg mx-auto mt-10 rounded-xl border border-surface-200 bg-white p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Approvals</h2>
          <p className="text-sm text-surface-500 mb-5">{upgradeMessage("business")}</p>
          <Link
            href="/event-manager/settings/billing"
            className="inline-flex px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const { workspaceId, user } = await requireWorkspace();
  const supabase = await createClient();
  const sp = await searchParams;

  const str = (key: string): string => (typeof sp[key] === "string" ? (sp[key] as string) : "");
  const arr = (key: string): string[] => {
    const v = sp[key];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return [v];
    return [];
  };

  const q = str("q").trim().toLowerCase();
  const moduleFilter = str("module");
  const reviewerFilter = str("reviewer"); // "" = all, "me" = mine, "unassigned", or a user id
  const workflowFilter = str("workflow");
  const priorityFilter = str("priority");
  const dueFilter = str("due");
  const sort = str("sort") || "due_asc";
  const formSubmitted = str("f") === "1";
  const statusFilter = formSubmitted ? arr("status") : DEFAULT_STATUSES;
  const page = Math.max(1, parseInt(str("page") || "1", 10) || 1);
  const selectedApprovalId = str("approval");

  // ── Full unfiltered dataset — powers KPIs, charts and deep-linked detail view ──
  const { data: rows } = await supabase
    .from("approval_requests")
    .select(
      "id, automation_id, run_id, request_type, module, priority, status, reason, trigger_context, before_state, after_state, submitted_by, submitted_at, reviewer_id, due_at, decided_by, decided_at, smart_rules(name)"
    )
    .eq("workspace_id", workspaceId)
    .order("submitted_at", { ascending: false });

  const rawRows = rows ?? [];

  // Resolve user display names (submitted_by / reviewer_id / decided_by) via profiles.
  const userIds = Array.from(
    new Set(
      rawRows.flatMap((r) => [r.submitted_by, r.reviewer_id, r.decided_by]).filter((v): v is string => Boolean(v))
    )
  );
  const nameByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds);
    for (const p of profiles ?? []) nameByUser.set(p.user_id, p.display_name ?? "Unknown");
  }

  // Workspace members for the reviewer filter/select + "assign to me" affordance.
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  const memberIds = (members ?? []).map((m) => m.user_id);
  const memberProfiles = new Map<string, string>(nameByUser);
  const missingMemberIds = memberIds.filter((id) => !memberProfiles.has(id));
  if (missingMemberIds.length > 0) {
    const { data: extra } = await supabase.from("profiles").select("user_id, display_name").in("user_id", missingMemberIds);
    for (const p of extra ?? []) memberProfiles.set(p.user_id, p.display_name ?? "Unknown");
  }
  const memberOptions: MemberOption[] = memberIds
    .map((id) => ({ id, name: memberProfiles.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allApprovals: FullApprovalRow[] = rawRows.map((r) => ({
    id: r.id,
    automationId: r.automation_id,
    automationName: (r.smart_rules as unknown as { name: string } | null)?.name ?? "Manual approval",
    requestType: r.request_type,
    module: r.module,
    priority: (r.priority as FullApprovalRow["priority"]) ?? "medium",
    status: (r.status as FullApprovalRow["status"]) ?? "pending",
    reason: r.reason,
    triggerContext: (r.trigger_context as Record<string, unknown>) ?? {},
    beforeState: (r.before_state as Record<string, unknown>) ?? null,
    afterState: (r.after_state as Record<string, unknown>) ?? null,
    submittedBy: r.submitted_by,
    submittedByName: r.submitted_by === user.id ? "You" : nameByUser.get(r.submitted_by ?? "") ?? "Unknown",
    submittedAt: r.submitted_at,
    reviewerId: r.reviewer_id,
    reviewerName: r.reviewer_id ? (r.reviewer_id === user.id ? "You" : nameByUser.get(r.reviewer_id) ?? "Unknown") : null,
    dueAt: r.due_at,
    decidedBy: r.decided_by,
    decidedByName: r.decided_by ? (r.decided_by === user.id ? "You" : nameByUser.get(r.decided_by) ?? "Unknown") : null,
    decidedAt: r.decided_at,
  }));

  // ── KPIs — always from the full unfiltered workspace dataset ──
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const pendingApprovals = allApprovals.filter((a) => a.status === "pending").length;
  const approvedToday = allApprovals.filter((a) => a.status === "approved" && a.decidedAt && new Date(a.decidedAt) >= todayStart).length;
  const rejectedToday = allApprovals.filter((a) => a.status === "rejected" && a.decidedAt && new Date(a.decidedAt) >= todayStart).length;
  const escalatedCount = allApprovals.filter((a) => a.status === "escalated").length;

  const decided = allApprovals.filter((a) => a.decidedAt);
  const avgReviewMs =
    decided.length > 0
      ? decided.reduce((sum, a) => sum + (new Date(a.decidedAt as string).getTime() - new Date(a.submittedAt).getTime()), 0) / decided.length
      : null;
  const avgReviewTime =
    avgReviewMs !== null
      ? (() => {
          const totalMins = Math.max(0, Math.round(avgReviewMs / 60000));
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        })()
      : "—";

  const decidedWithDue = decided.filter((a) => a.dueAt);
  const slaMet = decidedWithDue.filter((a) => new Date(a.decidedAt as string) <= new Date(a.dueAt as string)).length;
  const slaMetPct = decidedWithDue.length > 0 ? Math.round((slaMet / decidedWithDue.length) * 100) : null;

  // ── Charts — from the full unfiltered dataset ──
  const statusCounts = { pending: 0, approved: 0, rejected: 0, changes_requested: 0, escalated: 0 };
  for (const a of allApprovals) statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  const statusDonut = [
    { label: "Pending", value: statusCounts.pending, color: "#f59e0b" },
    { label: "Approved", value: statusCounts.approved, color: "#22c55e" },
    { label: "Rejected", value: statusCounts.rejected, color: "#ef4444" },
    { label: "Changes Requested", value: statusCounts.changes_requested, color: "#f97316" },
    { label: "Escalated", value: statusCounts.escalated, color: "#b91c1c" },
  ].filter((d) => d.value > 0);

  const moduleCounts = new Map<string, number>();
  for (const a of allApprovals) moduleCounts.set(a.module, (moduleCounts.get(a.module) ?? 0) + 1);
  const moduleBreakdown = Array.from(moduleCounts.entries())
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count);

  const slaDonut =
    decidedWithDue.length > 0
      ? [
          { label: "Met SLA", value: slaMet, color: "#22c55e" },
          { label: "Missed SLA", value: decidedWithDue.length - slaMet, color: "#ef4444" },
        ]
      : null;

  // ── Filter option lists — from the full dataset ──
  const moduleOptions = Array.from(new Set(allApprovals.map((a) => a.module))).sort();
  const workflowOptions = Array.from(new Set(allApprovals.map((a) => a.requestType))).sort();

  // ── Apply filters ──
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400000);
  const filtered = allApprovals.filter((a) => {
    if (statusFilter.length > 0 && !statusFilter.includes(a.status)) return false;
    if (q) {
      const haystack = `${a.automationName} ${a.requestType}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (moduleFilter && a.module !== moduleFilter) return false;
    if (workflowFilter && a.requestType !== workflowFilter) return false;
    if (priorityFilter && a.priority !== priorityFilter) return false;
    if (reviewerFilter === "me" && a.reviewerId !== user.id) return false;
    if (reviewerFilter === "unassigned" && a.reviewerId) return false;
    if (reviewerFilter && reviewerFilter !== "me" && reviewerFilter !== "unassigned" && a.reviewerId !== reviewerFilter) return false;
    if (dueFilter === "overdue" && !(a.dueAt && new Date(a.dueAt) < now && a.status === "pending")) return false;
    if (dueFilter === "today" && !(a.dueAt && new Date(a.dueAt).toDateString() === now.toDateString())) return false;
    if (dueFilter === "week" && !(a.dueAt && new Date(a.dueAt) >= now && new Date(a.dueAt) <= weekEnd)) return false;
    if (dueFilter === "none" && a.dueAt) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "due_desc":
        return (b.dueAt ? new Date(b.dueAt).getTime() : -Infinity) - (a.dueAt ? new Date(a.dueAt).getTime() : -Infinity);
      case "submitted_desc":
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      case "submitted_asc":
        return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      case "priority_desc": {
        const order = { high: 0, medium: 1, low: 2 } as const;
        return order[a.priority] - order[b.priority];
      }
      case "due_asc":
      default:
        return (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const hasFilters =
    Boolean(q || moduleFilter || workflowFilter || priorityFilter || reviewerFilter || dueFilter || (sort && sort !== "due_asc")) ||
    (formSubmitted && (statusFilter.length !== DEFAULT_STATUSES.length || !DEFAULT_STATUSES.every((s) => statusFilter.includes(s))));

  // ── Selected approval detail (deep-linkable, independent of current filters) ──
  const selectedApproval = selectedApprovalId ? allApprovals.find((a) => a.id === selectedApprovalId) ?? null : null;
  let comments: CommentRow[] = [];
  if (selectedApproval) {
    const rawComments = await getApprovalComments(workspaceId, selectedApproval.id);
    const commentAuthorIds = Array.from(new Set(rawComments.map((c) => c.author_id).filter((v): v is string => Boolean(v))));
    const missingAuthors = commentAuthorIds.filter((id) => !nameByUser.has(id) && !memberProfiles.has(id));
    if (missingAuthors.length > 0) {
      const { data: extra } = await supabase.from("profiles").select("user_id, display_name").in("user_id", missingAuthors);
      for (const p of extra ?? []) memberProfiles.set(p.user_id, p.display_name ?? "Unknown");
    }
    comments = rawComments.map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: c.author_id === user.id ? "You" : memberProfiles.get(c.author_id ?? "") ?? nameByUser.get(c.author_id ?? "") ?? "Unknown",
      body: c.body,
      createdAt: c.created_at,
    }));
  }

  const triggerContextEntries = (ctx: Record<string, unknown>) =>
    Object.entries(ctx).map(([k, v]) => ({ label: humanizeKey(k), value: String(v) }));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Automations"
        tabs={<SectionTabs tabs={AUTOMATIONS_TABS} />}
        actions={
          <>
            <Link
              href="/event-manager/automations/ai-builder"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              AI Builder
            </Link>
            <Link
              href="/event-manager/automations/builder/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New automation
            </Link>
          </>
        }
      />
      <ApprovalsClient
        currentUserId={user.id}
        kpis={{
          pendingApprovals,
          approvedToday,
          rejectedToday,
          escalatedCount,
          avgReviewTime,
          slaMetPct,
        }}
        statusDonut={statusDonut}
        moduleBreakdown={moduleBreakdown}
        slaDonut={slaDonut}
        slaMetPct={slaMetPct}
        moduleOptions={moduleOptions}
        workflowOptions={workflowOptions}
        memberOptions={memberOptions}
        filters={{
          q: str("q"),
          module: moduleFilter,
          reviewer: reviewerFilter,
          workflow: workflowFilter,
          priority: priorityFilter,
          status: statusFilter,
          due: dueFilter,
          sort,
        }}
        pageRows={pageRows}
        exportRows={sorted}
        totalFiltered={sorted.length}
        totalAll={allApprovals.length}
        page={clampedPage}
        totalPages={totalPages}
        hasFilters={hasFilters}
        selectedApproval={selectedApproval}
        selectedApprovalTriggerEntries={selectedApproval ? triggerContextEntries(selectedApproval.triggerContext) : []}
        comments={comments}
      />
    </div>
  );
}
