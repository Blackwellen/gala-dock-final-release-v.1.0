import Link from "next/link";
import {
  Files,
  FileText,
  Package,
  Image as ImageIcon,
  FileCheck,
  ArrowRight,
} from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { kindLabel } from "./library-utils";

export const metadata = { title: "Library" };

// Kinds shown in the Files bucket (media + generic documents).
const FILE_KINDS = ["image", "video", "audio", "document", "archive"] as const;
const TEMPLATE_KINDS = ["template", "snippet", "checklist", "email", "playbook", "invoice_template"] as const;
const BRAND_KINDS = ["asset", "poster", "flyer", "signage", "presentation"] as const;
const SUPPLIER_KINDS = ["contract", "rider"] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function LibraryPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("library_assets")
    .select("id, title, kind, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = assets ?? [];

  const countIn = (kinds: readonly string[]) =>
    rows.filter((r) => kinds.includes(r.kind)).length;

  const HUB_CARDS = [
    {
      href: "/library/files",
      icon: Files,
      iconColor: "text-brand-600",
      iconBg: "bg-brand-50",
      title: "Files",
      count: countIn(FILE_KINDS),
      description: "Images, documents and videos used across events",
    },
    {
      href: "/library/templates",
      icon: FileText,
      iconColor: "text-violet-600",
      iconBg: "bg-violet-50",
      title: "Templates",
      count: countIn(TEMPLATE_KINDS),
      description: "Run-sheets, briefing docs and email templates",
    },
    {
      href: "/library/event-packs",
      icon: Package,
      iconColor: "text-warning-600",
      iconBg: "bg-warning-50",
      title: "Event Packs",
      count: 0,
      description: "Bundled starter packs for common event types",
    },
    {
      href: "/library/brand-assets",
      icon: ImageIcon,
      iconColor: "text-success-600",
      iconBg: "bg-success-50",
      title: "Brand Assets",
      count: countIn(BRAND_KINDS),
      description: "Logos, posters and presentation assets",
    },
    {
      href: "/library/supplier-docs",
      icon: FileCheck,
      iconColor: "text-danger-600",
      iconBg: "bg-danger-50",
      title: "Supplier Documents",
      count: countIn(SUPPLIER_KINDS),
      description: "Contracts and supplier riders",
    },
  ];

  const recent = rows.slice(0, 5);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Library"
        description="Files, templates, brand assets and supplier documents"
      />

      <div className="flex-1 p-6 space-y-8">
        {/* Quick access cards */}
        <div>
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {HUB_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group bg-white rounded-xl border border-surface-200 shadow-card p-5 text-left hover:border-brand-200 hover:shadow-md transition-all"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.iconBg} mb-4`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} strokeWidth={1.8} />
                </div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-surface-900">{card.title}</p>
                  <span className="text-xs font-semibold text-surface-400 tabular-nums shrink-0">{card.count}</span>
                </div>
                <p className="text-xs text-surface-500 leading-relaxed">{card.description}</p>
                <div className="mt-4 flex items-center gap-1 text-xs text-brand-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent uploads */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Recent Uploads</h2>
            <Link
              href="/library/files"
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              View all files
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card">
              <EmptyState
                icon={Files}
                title="No files yet"
                description="Files you upload to your library will appear here."
                compact
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm divide-y divide-surface-100">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Kind</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {recent.map((file) => (
                      <tr key={file.id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-surface-900">
                          <Link href={`/library/files/${file.id}`} className="hover:text-brand-600">
                            {file.title}
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                            {kindLabel(file.kind)}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-surface-500">{formatDate(file.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
