import Link from "next/link";
import { MonitorPlay, Users, Radio, Film, ArrowRight } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { num, dateShort, time } from "@/lib/format";
import type { SectionProps } from "./types";
import { SessionButton, SessionTransitions, LinksReveal, RolesPanel, RecordingButton, RecordingToggle, TierModes, type Session, type Role, type Recording } from "./online-client";

type Summary = { session_id: string; unique_attendees: number; joins: number; online_now: number; live_minutes: number; replay_views: number };
const STATUS: Record<string, "gray" | "blue" | "green" | "amber" | "red"> = { draft: "gray", scheduled: "blue", live: "green", ended: "amber", cancelled: "red", archived: "gray" };
const KIND: Record<string, string> = { main: "Main stage", breakout: "Breakout", workshop: "Workshop", webinar: "Webinar", live_audio: "Live audio", podcast: "Podcast", remote: "Remote", replay: "Replay" };
const ACCESS: Record<string, string> = { ticket: "Ticket holders", registration: "Approved registrations", ticket_or_registration: "Tickets or registrations", invite_only: "Invited roles only" };
const when = (iso?: string | null) => (iso ? `${dateShort(iso)} ${time(iso)}` : "");

/** Plan › Online sessions (Q29): sessions, lifecycle, roles, hybrid tier modes, recordings and attendance. Gala Dock gates access; providers host the media. */
export async function OnlineSection({ e, d, role }: SectionProps) {
  const db = untyped(await createClient());
  const canEdit = ["owner", "manager", "member"].includes(role), canManage = ["owner", "manager"].includes(role);
  if (!canEdit) return <Card><Empty icon={MonitorPlay} title="Online sessions are for event editors" text="Owners, managers and members manage online sessions. Ask one of them for access." /></Card>;
  const [sessQ, rolesQ, modesQ, recQ, sumQ, legacyQ] = await Promise.all([
    db.from("virtual_sessions").select("id,title,kind,track,parent_session_id,programme_item_id,starts_at,ends_at,status,provider,access,tier_ids,capacity,max_devices_per_attendee,opens_minutes_before,closes_minutes_after,captions,caption_languages,sign_language,transcript,audio_description,accessibility_notes").eq("event_id", e.id).order("starts_at"),
    db.from("virtual_session_roles").select("id,session_id,user_id,role,status,display_name,created_at,revoked_at").eq("event_id", e.id).order("created_at"),
    db.from("virtual_tier_access").select("tier_id,mode").eq("event_id", e.id),
    db.from("virtual_recordings").select("id,session_id,title,source,status,audience,access_from,access_until,captions,created_at").eq("event_id", e.id).order("created_at", { ascending: false }),
    db.rpc("virtual_attendance_summary", { p_event: e.id }),
    db.from("event_virtual").select("capacity,provider,join_url").eq("event_id", e.id).maybeSingle(),
  ]);
  const sessions = (sessQ.data ?? []) as Session[], roles = (rolesQ.data ?? []) as Role[], recs = (recQ.data ?? []) as Recording[];
  const summary = new Map(((sumQ.data ?? []) as Summary[]).map(s => [s.session_id, s]));
  const modes = Object.fromEntries(((modesQ.data ?? []) as { tier_id: string; mode: string }[]).map(m => [m.tier_id, m.mode]));
  const tiers = d.tiers.map(t => ({ id: t.id as string, name: t.name as string, quantity: Number(t.quantity ?? 0) }));
  const programme = (d.programme as { id: string; title?: string | null; starts_at?: string | null }[]).map(p => ({ id: p.id, name: `${p.title ?? "Programme item"}${p.starts_at ? ` · ${time(p.starts_at)}` : ""}` }));
  const legacy = legacyQ.data as { capacity: number | null; provider: string; join_url: string | null } | null;
  const totals = [...summary.values()].reduce((s, x) => ({ u: s.u + Number(x.unique_attendees), now: s.now + Number(x.online_now), min: s.min + Number(x.live_minutes), rep: s.rep + Number(x.replay_views) }), { u: 0, now: 0, min: 0, rep: 0 });
  const tops = sessions.filter(s => !s.parent_session_id || !sessions.some(p => p.id === s.parent_session_id));
  const ordered = tops.flatMap(s => [s, ...sessions.filter(c => c.parent_session_id === s.id)]);
  const opts = { tiers: tiers.map(({ id, name }) => ({ id, name })), programme, sessions: sessions.map(s => ({ id: s.id, name: s.title })) };

  return <div className="ax-wrap">
    <div className="k-grid k-g4 ax-kpis">
      <div className="k-kpi"><span className="k-tile lg"><MonitorPlay size={20} /></span><div className="k-grow"><div className="lbl">Sessions</div><div className="val">{sessions.length}</div><div className="sub">{sessions.filter(s => s.status === "live").length} live · {sessions.filter(s => s.status === "scheduled").length} scheduled</div></div></div>
      <div className="k-kpi"><span className="k-tile lg green"><Radio size={20} /></span><div className="k-grow"><div className="lbl">Online now</div><div className="val">{num(totals.now)}</div><div className="sub">seen in the last 2 minutes</div></div></div>
      <div className="k-kpi"><span className="k-tile lg purple"><Users size={20} /></span><div className="k-grow"><div className="lbl">Unique attendees</div><div className="val">{num(totals.u)}</div><div className="sub">{num(Math.round(totals.min))} live minutes in total</div></div></div>
      <div className="k-kpi"><span className="k-tile lg amber"><Film size={20} /></span><div className="k-grow"><div className="lbl">Replay views</div><div className="val">{num(totals.rep)}</div><div className="sub">{recs.filter(r => r.status === "available").length} recordings available</div></div></div>
    </div>
    <p className="k-notice"><span>Gala Dock doesn&apos;t host video or audio. Run sessions on your platform and paste its links; attendees join through Gala Dock, which checks their ticket or registration, the access window and device limits. Refunded, transferred or resold tickets lose access automatically.</span></p>

    <div className="ax-grid">
      <Card>
        <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Sessions</h2><p className="k-small">Draft → scheduled → live → ended → archived. Ending, cancelling or archiving closes attendance and revokes unused join links.</p></div>
          <SessionButton eventId={e.id} {...opts} /></div>
        {ordered.length ? ordered.map(s => { const sum = summary.get(s.id); const sr = roles.filter(r => r.session_id === s.id); const sRec = recs.filter(r => r.session_id === s.id);
          return <article key={s.id} className={`ax-session${s.parent_session_id ? " child" : ""}`} aria-label={s.title}>
            <div className="k-between" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}><b className="k-strong">{s.title}</b> <Chip tone={STATUS[s.status] ?? "gray"}>{s.status}</Chip> <Chip tone="gray">{KIND[s.kind] ?? s.kind}</Chip>{s.track && <> <Chip tone="purple">{s.track}</Chip></>}
                <div className="k-xs k-muted">{when(s.starts_at)} – {time(s.ends_at)} · doors {s.opens_minutes_before} min before, close {s.closes_minutes_after} min after · {s.provider.replace("_", " ")}</div>
                <div className="k-xs k-muted">{ACCESS[s.access] ?? s.access}{s.tier_ids.length ? ` · ${s.tier_ids.map(t => tiers.find(x => x.id === t)?.name ?? "tier").join(", ")}` : ""}{s.capacity ? ` · ${num(s.capacity)} places` : ""} · {s.max_devices_per_attendee} device{s.max_devices_per_attendee === 1 ? "" : "s"} each
                  {s.captions !== "none" || s.sign_language || s.transcript || s.audio_description ? ` · ${[s.captions !== "none" ? `captions (${s.captions.replace("_", " ")})` : "", s.sign_language ? "sign language" : "", s.transcript ? "transcript" : "", s.audio_description ? "audio description" : ""].filter(Boolean).join(", ")}` : ""}</div></div>
              <span className="ax-actions"><SessionButton eventId={e.id} session={s} {...opts} /><SessionTransitions session={s} /></span>
            </div>
            {sum && <div className="ax-mini"><div><b>{num(sum.online_now)}</b><span>Online now</span></div><div><b>{num(sum.unique_attendees)}</b><span>Attendees</span></div><div><b>{num(sum.joins)}</b><span>Joins</span></div>
              <div><b>{num(Math.round(Number(sum.live_minutes)))}</b><span>Live minutes</span></div><div><b>{num(sum.replay_views)}</b><span>Replay views</span></div><div><b>{sRec.length}</b><span>Recordings</span></div></div>}
            <LinksReveal sessionId={s.id} />
            <RolesPanel sessionId={s.id} roles={sr} canManage={canManage} />
            <div>
              <div className="k-between" style={{ gap: 8 }}><b className="k-xs k-strong">Recordings</b><RecordingButton sessionId={s.id} sessionTitle={s.title} /></div>
              {sRec.length ? <div className="k-list">{sRec.map(r => <div key={r.id} className="k-li ax-li"><div className="k-grow" style={{ minWidth: 0 }}><b className="k-small k-strong k-ellipsis">{r.title}</b>
                <div className="k-xs k-muted">{r.source === "file" ? "Private file" : "Provider link"} · {r.audience.replace("_", " ")}{r.access_from || r.access_until ? ` · ${when(r.access_from) || "now"} → ${when(r.access_until) || "no end"}` : ""}{r.captions ? " · captions" : ""}</div></div>
                <Chip tone={r.status === "available" ? "green" : r.status === "withdrawn" ? "red" : "amber"}>{r.status}</Chip><RecordingButton sessionId={s.id} sessionTitle={s.title} recording={r} /><RecordingToggle recording={r} /></div>)}</div>
                : <p className="k-xs k-muted" style={{ margin: "4px 0 0" }}>No recordings yet.</p>}
            </div>
          </article>; })
          : <Empty icon={MonitorPlay} title="No online sessions yet" text="Add a main stage, breakouts or a webinar. Paste the platform's links; attendees join through their ticket or registration." action={<SessionButton eventId={e.id} {...opts} primary />} />}
      </Card>

      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card>
          <h2 className="ov-h" style={{ fontSize: 15 }}>Hybrid ticket modes</h2>
          <p className="k-xs k-muted">Choose whether each tier is for the venue, online or both. Online places can&apos;t exceed the online capacity{legacy?.capacity ? ` (${num(legacy.capacity)})` : ""}; in-person places can&apos;t exceed the venue capacity{e.capacity ? ` (${num(e.capacity)})` : ""}. In-person tickets can&apos;t join online; online-only tickets are refused at the door.</p>
          {tiers.length ? <TierModes tiers={tiers} modes={modes} /> : <p className="k-small">No ticket tiers yet. <Link className="k-link" href={`/organizer/events/${e.id}/tickets/setup?step=1`}>Set up tickets</Link></p>}
        </Card>
        <Card>
          <h2 className="ov-h" style={{ fontSize: 15 }}>Event-level online settings</h2>
          <p className="k-xs k-muted">Online capacity and the single event link for events without sessions live on the online session page.</p>
          <dl className="ax-dl" style={{ marginTop: 8 }}><dt>Online capacity</dt><dd>{legacy?.capacity ? num(legacy.capacity) : "Not set"}</dd><dt>Event link</dt><dd>{legacy?.join_url ? `Set (${legacy.provider.replace("_", " ")})` : "Not set"}</dd></dl>
          <Link className="k-btn outline block sm" style={{ marginTop: 10 }} href={`/organizer/events/${e.id}/virtual`}>Online capacity & event link <ArrowRight size={12} /></Link>
        </Card>
      </div>
    </div>
  </div>;
}
