import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Archive, Tag, FileText, Image as ImageIcon, Film, File } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { kindLabel, formatBytes, formatLibDate } from "../../library-utils";

export const metadata = { title: "File" };

function PreviewIcon({ kind }: { kind: string }) {
  if (kind === "image") return <ImageIcon className="w-12 h-12 text-brand-400" strokeWidth={1.4} />;
  if (kind === "video") return <Film className="w-12 h-12 text-violet-400" strokeWidth={1.4} />;
  if (kind === "document" || kind === "archive") return <FileText className="w-12 h-12 text-danger-400" strokeWidth={1.4} />;
  return <File className="w-12 h-12 text-surface-400" strokeWidth={1.4} />;
}

export default async function FileDetailPage({
  params,
}: {
  params: Promise<{ fileId: string }>;
}) {
  const { fileId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("library_assets")
    .select("id, title, kind, mime, size_bytes, tags, description, created_at, entity_type, entity_id")
    .eq("workspace_id", workspaceId)
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!asset) notFound();

  const typeLabel = asset.mime ?? kindLabel(asset.kind);
  const sizeLabel = formatBytes(asset.size_bytes);
  const tags = asset.tags ?? [];

  const meta = [
    { label: "Title", value: asset.title },
    { label: "Kind", value: kindLabel(asset.kind) },
    { label: "Type", value: typeLabel },
    { label: "Size", value: sizeLabel },
    { label: "Uploaded", value: formatLibDate(asset.created_at) },
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={asset.title}
        description={`${kindLabel(asset.kind)} · ${sizeLabel}`}
        actions={
          <>
            <Link
              href="/library/files"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              <Download className="w-4 h-4" />
              Download
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-4xl space-y-6">
        {/* Large preview */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="h-72 bg-surface-50 flex flex-col items-center justify-center gap-3 border-b border-surface-200">
            <PreviewIcon kind={asset.kind} />
            <p className="text-sm font-medium text-surface-500">{asset.title}</p>
            <p className="text-xs text-surface-400">{kindLabel(asset.kind)} · {sizeLabel}</p>
          </div>
          <div className="p-6">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
              {meta.map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-surface-900 truncate">{value}</dd>
                </div>
              ))}
            </dl>
            {asset.description && (
              <p className="mt-4 text-sm text-surface-600">{asset.description}</p>
            )}
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-surface-400" strokeWidth={1.8} />
              <h3 className="text-sm font-semibold text-surface-900">Tags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-100">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Used in */}
        {asset.entity_type && asset.entity_id && (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
            <h3 className="text-sm font-semibold text-surface-900 mb-4">Used In</h3>
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-50 border border-surface-100">
              <div>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-surface-200 text-surface-500 mr-2 capitalize">
                  {asset.entity_type}
                </span>
                <span className="text-sm font-medium text-surface-900">{asset.entity_id}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
