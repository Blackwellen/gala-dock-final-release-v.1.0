import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { kindLabel, formatLibDate, type LibraryKind } from "../library-utils";

export const metadata = { title: "Templates" };

const TEMPLATE_KINDS: LibraryKind[] = ["template", "snippet", "checklist", "email", "playbook", "invoice_template"];

const TYPE_COLORS: Record<string, string> = {
  template: "bg-brand-50 text-brand-700 border-brand-100",
  checklist: "bg-success-50 text-success-700 border-success-100",
  snippet: "bg-warning-50 text-warning-700 border-warning-100",
  email: "bg-violet-50 text-violet-700 border-violet-100",
  playbook: "bg-info-50 text-info-600 border-info-200",
  invoice_template: "bg-surface-100 text-surface-600 border-surface-200",
};

export default async function TemplatesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("library_assets")
    .select("id, title, kind, use_count, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("kind", TEMPLATE_KINDS)
    .order("created_at", { ascending: false });

  const templates = assets ?? [];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Templates"
        description="Reusable documents and blueprints for your events"
        actions={
          <Link
            href="/library/templates/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Template
          </Link>
        }
      />

      <div className="flex-1 p-6">
        {templates.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={FileText}
              title="No templates yet"
              description="Create reusable run-sheets, briefs and email templates for your events."
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Template Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Times Used</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {templates.map((tpl) => (
                    <tr key={tpl.id} className="group hover:bg-surface-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-surface-900">
                        <Link href={`/library/templates/${tpl.id}`} className="hover:text-brand-600">
                          {tpl.title}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[tpl.kind] ?? "bg-surface-100 text-surface-600 border-surface-200"}`}>
                          {kindLabel(tpl.kind)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-surface-600">{tpl.use_count}</td>
                      <td className="px-6 py-3 text-surface-500">{formatLibDate(tpl.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
