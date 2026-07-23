import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsightCard } from "@/components/venues/VenueProfileShell";
import { formatDate } from "../../lib";
import { NoteForm } from "./NoteForm";
import { NotePinButton } from "./NotePinButton";
import { StickyNote, Pin } from "lucide-react";

export const dynamic = "force-dynamic";

const NOTE_TYPE_LABEL: Record<string, string> = {
  general: "General Note",
  site_visit: "Site Visit",
  call_summary: "Call Summary",
  commercial: "Commercial",
  logistics: "Logistics",
  technical: "Technical",
  accessibility: "Accessibility",
  client_feedback: "Client Feedback",
};

export default async function VenueNotesPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: notes } = await supabase
    .from("venue_notes")
    .select("id, body, is_pinned, note_type, created_at")
    .eq("venue_id", venueId)
    .eq("workspace_id", workspaceId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = notes ?? [];
  const pinned = rows.filter((n) => n.is_pinned);

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="min-w-0 space-y-4">
        <p className="text-sm text-surface-500">{rows.length} note{rows.length === 1 ? "" : "s"} · {pinned.length} pinned</p>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState icon={StickyNote} title="No notes yet" description="Capture site visits, call summaries and commercial notes here." compact />
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((n) => (
              <div key={n.id} className="bg-white rounded-xl border border-surface-200 shadow-card p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    {n.is_pinned && <Pin className="w-3.5 h-3.5 text-brand-600 fill-brand-100" strokeWidth={1.8} />}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-100 text-surface-600">
                      {NOTE_TYPE_LABEL[n.note_type] ?? "General Note"}
                    </span>
                    <span className="text-xs text-surface-400">{formatDate(n.created_at)}</span>
                  </div>
                  <NotePinButton venueId={venueId} noteId={n.id} pinned={n.is_pinned} />
                </div>
                <p className="text-sm text-surface-700 whitespace-pre-line">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <InsightCard title="Pinned Notes">
          {pinned.length === 0 ? (
            <p className="text-sm text-surface-400">No pinned notes.</p>
          ) : (
            <div className="space-y-2">
              {pinned.map((n) => (
                <p key={n.id} className="text-sm text-surface-600 line-clamp-2">{n.body}</p>
              ))}
            </div>
          )}
        </InsightCard>
        <InsightCard title="Create Note">
          <NoteForm venueId={venueId} />
        </InsightCard>
      </div>
    </div>
  );
}
