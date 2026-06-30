import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MoodBoardItem } from "@/lib/supabase/types";
import { MoodBoardClient, type MoodItemView } from "./MoodBoardClient";
import { createBoard } from "./actions";

export const metadata: Metadata = { title: "Mood Board" };
export const dynamic = "force-dynamic";

export default async function MoodBoardPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) notFound();

  // One board per event in the UI — take the most recently created if several exist.
  const { data: boardRow } = await supabase
    .from("event_mood_boards")
    .select("*")
    .eq("event_id", eventId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let itemViews: MoodItemView[] = [];
  if (boardRow) {
    const { data: itemData } = await supabase
      .from("mood_board_items")
      .select("*")
      .eq("mood_board_id", boardRow.id)
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true });
    const items = (itemData ?? []) as MoodBoardItem[];

    // Sign image URLs in bulk.
    const imageKeys = items
      .map((i) => i.storage_key)
      .filter((k): k is string => Boolean(k));
    const signedMap = new Map<string, string>();
    if (imageKeys.length > 0) {
      const { data: signed } = await supabase.storage
        .from("event-files")
        .createSignedUrls(imageKeys, 3600);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
      }
    }

    itemViews = items.map((i) => ({
      id: i.id,
      storage_key: i.storage_key,
      color_hex: i.color_hex,
      caption: i.caption,
      sort_order: i.sort_order,
      imageUrl: i.storage_key ? signedMap.get(i.storage_key) ?? null : null,
    }));
  }

  const createBoardAction = createBoard.bind(null, eventId);

  return (
    <div className="min-h-full bg-surface-50 animate-fade-in">
      <PageHeader
        title={boardRow?.title ?? "Mood Board"}
        description="Collect inspiration images and a colour palette for this event."
      />

      <div className="p-6">
        {!boardRow ? (
          <div className="mx-auto max-w-md rounded-xl border border-surface-200 bg-white p-8 shadow-card">
            <EmptyState
              icon={LayoutGrid}
              title="Create a mood board"
              description="Collect inspiration images and a colour palette for this event."
              compact
            />
            <form action={createBoardAction} className="mt-2 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-700">
                  Board title
                </label>
                <input
                  name="title"
                  defaultValue="Mood Board"
                  className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-surface-700">
                  Notes (optional)
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Elegant, romantic, candlelit atmosphere…"
                  className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Create mood board
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-5">
            {boardRow.notes && (
              <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                {boardRow.notes}
              </div>
            )}
            <MoodBoardClient eventId={eventId} boardId={boardRow.id} items={itemViews} />
          </div>
        )}
      </div>
    </div>
  );
}
