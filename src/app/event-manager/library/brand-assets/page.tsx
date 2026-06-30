import Link from "next/link";
import { Upload, Image as ImageIcon } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { kindLabel, formatLibDate, type LibraryKind } from "../library-utils";

export const metadata = { title: "Brand Assets" };

const BRAND_KINDS: LibraryKind[] = ["asset", "poster", "flyer", "signage", "presentation"];

export default async function BrandAssetsPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("library_assets")
    .select("id, title, kind, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("kind", BRAND_KINDS)
    .order("created_at", { ascending: false });

  const rows = assets ?? [];

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Brand Assets"
        description="Logos, posters and brand collateral for your workspace"
        actions={
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Asset
            <input type="file" className="hidden" accept="image/*,.svg" />
          </label>
        }
      />

      <div className="flex-1 p-6 space-y-8 max-w-4xl">
        {/* Primary Logo uploader (upload-only) */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h2 className="text-sm font-semibold text-surface-900 mb-4">Primary Logo</h2>
          <label className="flex flex-col items-center justify-center gap-3 w-full max-w-sm border-2 border-dashed border-surface-200 rounded-xl p-8 hover:border-brand-400 hover:bg-brand-50/30 transition-colors cursor-pointer">
            <input type="file" className="hidden" accept="image/*,.svg" />
            <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
              <Upload className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-surface-700">Upload Primary Logo</p>
              <p className="text-xs text-surface-400 mt-1">SVG, PNG or JPG · recommended 400×100px</p>
            </div>
          </label>
        </div>

        {/* Live brand assets */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="p-6 border-b border-surface-100">
            <h2 className="text-sm font-semibold text-surface-900">Saved Brand Assets</h2>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title="No brand assets yet"
              description="Upload logos, posters and presentation assets to keep your brand collateral in one place."
              compact
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
              {rows.map((asset) => (
                <Link
                  key={asset.id}
                  href={`/event-manager/library/files/${asset.id}`}
                  className="group bg-white rounded-xl border border-surface-200 shadow-card hover:border-brand-200 hover:shadow-md transition-all overflow-hidden"
                >
                  <div className="h-24 flex items-center justify-center bg-success-50">
                    <ImageIcon className="w-6 h-6 text-success-600" strokeWidth={1.8} />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-surface-900 truncate">{asset.title}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-100 text-surface-500">
                        {kindLabel(asset.kind)}
                      </span>
                      <span className="text-[10px] text-surface-400">{formatLibDate(asset.created_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
