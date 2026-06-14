import { Package } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Event Packs" };

export default async function EventPacksPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  // Event packs are library_collections of kind "event_pack".
  const { data: collections } = await supabase
    .from("library_collections")
    .select("id, name, description, created_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", "event_pack")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const packs = collections ?? [];

  // Resolve member counts per collection.
  const countByCollection = new Map<string, number>();
  if (packs.length > 0) {
    const { data: members } = await supabase
      .from("library_collection_members")
      .select("collection_id")
      .in("collection_id", packs.map((p) => p.id));
    for (const m of members ?? []) {
      countByCollection.set(m.collection_id, (countByCollection.get(m.collection_id) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Event Packs"
        description="Bundled starter packs of templates and documents for common event types"
      />

      <div className="flex-1 p-6">
        {packs.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card">
            <EmptyState
              icon={Package}
              title="No event packs yet"
              description="Group templates and documents into reusable packs for common event types."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-6 border-b border-surface-100">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-brand-50 mb-4">
                    <Package className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
                  </div>
                  <h3 className="text-base font-semibold text-surface-900 mb-2">{pack.name}</h3>
                  {pack.description && (
                    <p className="text-sm text-surface-500 leading-relaxed">{pack.description}</p>
                  )}
                </div>
                <div className="px-6 py-4">
                  <span className="text-xs text-surface-400">
                    {countByCollection.get(pack.id) ?? 0} files included
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
