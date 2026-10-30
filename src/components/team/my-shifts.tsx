import { CalendarClock } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, Chip, Empty } from "@/components/kit";
import { untyped, rows } from "@/lib/workspace/db";
import { ShiftButtons, LeaveRequestButton, CancelLeave } from "./my-shifts-client";
import { dateShort, time } from "@/lib/format";

type Shift = { id: string; workspace_id: string; workspace_name: string; event_id: string | null; event_name: string | null; role: string; title: string; location: string; starts_at: string; ends_at: string; status: string; attendance: string; checked_in_at: string | null };
type Leave = { id: string; workspace_id: string; kind: string; starts_at: string; ends_at: string; status: string; decision_note: string };
const ATT: Record<string, ["green" | "blue" | "gray" | "red", string]> = { checked_in: ["green", "Checked in"], checked_out: ["blue", "Checked out"], no_show: ["red", "No-show"], not_arrived: ["gray", "Not arrived"] };

/** Staff "My shifts" (Q17 / W06): shifts across every team this login is linked to, with confirm / check-in and leave. */
export async function MyShifts({ client, userId }: { client: SupabaseClient | object; userId: string }) {
  const db = untyped(client as never);
  const shifts = await rows<Shift>(db.rpc("my_shifts", {}));
  const leave = await rows<Leave>(db.from("leave_requests").select("id,workspace_id,kind,starts_at,ends_at,status,decision_note").order("starts_at", { ascending: false }).limit(20));
  // Teams where this login is a linked crew member (leave is requested per team).
  const crew = await rows<{ workspace_id: string; workspaces: { name: string } | null }>(db.from("crew_members").select("workspace_id,workspaces(name)").eq("user_id", userId).neq("status", "deactivated"));
  const crewTeams = [...new Map(crew.map(c => [c.workspace_id, { id: c.workspace_id, name: c.workspaces?.name ?? "Team" }])).values()];
  return <div className="k-col" style={{ gap: 14 }}>
    <div className="k-page-head"><div><h1 style={{ fontSize: 28 }}>My shifts</h1><p className="sub">Confirm shifts, check in on the day and request leave.</p></div><LeaveRequestButton workspaces={crewTeams} /></div>
    <Card flush>{shifts.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>When</th><th>Shift</th><th>Event</th><th>Team</th><th>Status</th><th>Attendance</th><th /></tr></thead>
      <tbody>{shifts.map(s => <tr key={s.id}><td>{dateShort(s.starts_at)} · {time(s.starts_at)}–{time(s.ends_at)}</td><td><b>{s.role}</b>{s.location ? <div className="k-xs k-muted">{s.location}</div> : null}</td><td>{s.event_name ?? s.title ?? "—"}</td><td className="k-small">{s.workspace_name}</td>
        <td><Chip tone={s.status === "confirmed" ? "green" : s.status === "pending" ? "amber" : "gray"}>{s.status}</Chip></td><td><Chip tone={ATT[s.attendance]?.[0] ?? "gray"}>{ATT[s.attendance]?.[1] ?? s.attendance}</Chip></td><td><ShiftButtons id={s.id} status={s.status} attendance={s.attendance} /></td></tr>)}</tbody></table></div>
      : <div style={{ padding: 20 }}><Empty icon={CalendarClock} title="No upcoming shifts" text="When a manager assigns you to a shift it appears here and you get a notification." /></div>}</Card>
    {leave.length > 0 && <Card><h2 className="ov-h" style={{ marginBottom: 8 }}>Leave requests</h2><ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>{leave.map(l => <li key={l.id} className="k-between k-small"><span>{dateShort(l.starts_at)} – {dateShort(l.ends_at)} · {l.kind}{l.decision_note ? ` · ${l.decision_note}` : ""}</span><span className="k-row" style={{ gap: 6 }}><Chip tone={l.status === "approved" ? "green" : l.status === "pending" ? "amber" : "gray"}>{l.status}</Chip>{["pending", "approved"].includes(l.status) && <CancelLeave id={l.id} />}</span></li>)}</ul></Card>}
  </div>;
}
