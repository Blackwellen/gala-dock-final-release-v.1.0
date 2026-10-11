import "server-only";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceJobs } from "@/lib/provider/queries";

export type CrewRow = { id: string; user_id: string | null; name: string; role: string; member_type: string; email: string; phone: string; location: string; bio: string; skills: string[]; day_rate: number | null;
  status: string; avatar: string; created_at: string; details: { employment?: string; hourly_rate?: number | null; start_date?: string; timezone?: string; emergency_contact?: string; certifications?: { name: string; expires?: string }[]; languages?: string[] } };
export type ShiftRow = { id: string; crew_id: string | null; role: string; title: string; location: string; starts_at: string; ends_at: string; status: string; job_id: string | null; event_id: string | null };
export type BlockRow = { id: string; crew_id: string; kind: string; starts_at: string; ends_at: string; note: string };
export type Conflict = { kind: "double" | "travel" | "unavailable" | "request"; title: string; who: string; crewId: string | null; when: string; detail: string };

export async function loadTeam() {
  const [ctx, jobs] = await Promise.all([getProvider(), workspaceJobs()]);
  const ws = ctx.workspace.id;
  const [crew, shifts, blocks, requests] = await Promise.all([
    rows<CrewRow>(ctx.db.from("crew_members").select("id,user_id,name,role,member_type,email,phone,location,bio,skills,day_rate,status,avatar,created_at,details").eq("workspace_id", ws).order("name")),
    rows<ShiftRow>(ctx.db.from("shifts").select("id,crew_id,role,title,location,starts_at,ends_at,status,job_id,event_id").eq("workspace_id", ws).neq("status", "cancelled").order("starts_at")),
    rows<BlockRow>(ctx.db.from("availability_blocks").select("id,crew_id,kind,starts_at,ends_at,note").eq("workspace_id", ws).not("crew_id", "is", null).order("starts_at")),
    rows<{ id: string; title: string; detail: string; assignee_name: string; due_at: string | null; created_at: string }>(ctx.db.from("tasks").select("id,title,detail,assignee_name,due_at,created_at").eq("workspace_id", ws).eq("category", "availability_request").neq("status", "done")),
  ]);
  const now = Date.now();
  const t = (s: string) => new Date(s).getTime();
  const fmt = (s: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s));
  const conflicts: Conflict[] = [];
  const upcoming = shifts.filter(s => s.crew_id && t(s.ends_at) > now);
  for (const c of crew) {
    const mine = upcoming.filter(s => s.crew_id === c.id);
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      const a = mine[i], b = mine[j];
      if (t(a.starts_at) < t(b.ends_at) && t(b.starts_at) < t(a.ends_at)) conflicts.push({ kind: "double", title: "Double booking detected", who: c.name, crewId: c.id, when: a.starts_at, detail: `${fmt(a.starts_at)} — ${a.title} and ${b.title}` });
      else if (a.location && b.location && a.location !== b.location && Math.abs(t(b.starts_at) - t(a.ends_at)) < 60 * 6e4) conflicts.push({ kind: "travel", title: "Travel time conflict", who: c.name, crewId: c.id, when: b.starts_at, detail: "Under an hour between events at different locations" });
    }
    for (const s of mine) for (const b of blocks.filter(x => x.crew_id === c.id)) if (t(s.starts_at) < t(b.ends_at) && t(b.starts_at) < t(s.ends_at))
      conflicts.push({ kind: "unavailable", title: "Assigned while unavailable", who: c.name, crewId: c.id, when: s.starts_at, detail: `${s.title} — marked ${b.note || "unavailable"}` });
  }
  for (const r of requests) { const id = /crew:([0-9a-f-]{36})/.exec(r.detail)?.[1] ?? null; conflicts.push({ kind: "request", title: "Availability request pending", who: r.assignee_name, crewId: id, when: r.created_at, detail: r.title.replace(/^Availability request — /, "") }); }
  const unstaffed = jobs.filter(j => ["confirmed", "held", "active"].includes(j.status) && t(j.starts_at) > now && t(j.starts_at) < now + 30 * 864e5);
  return { ctx, crew, shifts, blocks, jobs, conflicts, unstaffed, requests };
}

/** The crew member's state "now": on assignment, unavailable (blocked) or available. */
export function crewState(c: CrewRow, shifts: ShiftRow[], blocks: BlockRow[], now = Date.now()) {
  if (c.status === "deactivated") return "deactivated";
  if (shifts.some(s => s.crew_id === c.id && new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now)) return "on_assignment";
  if (blocks.some(b => b.crew_id === c.id && new Date(b.starts_at).getTime() <= now && new Date(b.ends_at).getTime() > now) || c.status === "unavailable") return "unavailable";
  if (shifts.some(s => s.crew_id === c.id && new Date(s.starts_at).getTime() > now && new Date(s.starts_at).getTime() < now + 864e5 * 2)) return "on_assignment_soon";
  return "available";
}
