import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizer } from "@/lib/data/context";
import { untyped } from "@/lib/workspace/db";
import { PageHead } from "@/components/kit";
import { VIRTUAL_PROVIDERS, FORMAT_LABEL, providerStatus } from "@/lib/virtual/providers";
import { VirtualForm } from "./form";
import "@/styles/marketplace.css";

export const metadata = { title: "Online session" };
type V = { provider: string; format: string; external_id: string | null; join_url: string | null; host_url: string | null; host_notes: string | null; timezone: string; capacity: number | null;
  ticket_required: boolean; opens_minutes_before: number; closes_minutes_after: number; recording_url: string | null; replay_available: boolean; replay_until: string | null };

/** Online / hybrid session for an event (release spec §122–127). Attendees join through their ticket; host links stay private. */
export default async function VirtualPage({ params }: PageProps<"/organizer/events/[id]/virtual">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getOrganizer(`/organizer/events/${id}/virtual`);
  const db = untyped(ctx.supabase as never);
  const { data: e } = await db.from("events").select("id,name,workspace_id,starts_at").eq("id", id).maybeSingle();
  if (!e || e.workspace_id !== ctx.workspace.id) notFound();
  const [{ data: v }, { count: joins }] = await Promise.all([
    db.from("event_virtual").select("*").eq("event_id", id).maybeSingle(),
    db.from("check_ins").select("id", { count: "exact", head: true }).eq("event_id", id).eq("credential", "virtual"),
  ]);
  const providers = VIRTUAL_PROVIDERS.map(p => ({ key: p.key, label: p.label, status: providerStatus(p) }));
  return <div className="mk-page" style={{ display: "grid", gap: 16, maxWidth: 860 }}>
    <PageHead title="Online session" sub={<>For <Link href={`/organizer/events/${id}`} className="mk-link">{e.name}</Link>. Ticket holders get a <b>Join event</b> button that opens only inside the access window.</>} />
    <section className="mk-panel">
      <p className="mk-note">Gala Dock doesn’t host video or audio itself. Run the session on your platform and paste its links here. Attendees never see your host link; refunded, transferred or resold tickets lose access automatically.{v ? ` Online joins so far: ${joins ?? 0}.` : ""}</p>
      <VirtualForm eventId={id} initial={(v ?? null) as V | null} providers={providers} formats={Object.entries(FORMAT_LABEL)} />
    </section>
  </div>;
}
