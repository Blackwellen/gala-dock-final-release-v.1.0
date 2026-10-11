"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/provider/context";
import { friendly, type ActionResult } from "@/lib/workspace/rpc";
import { isUuid } from "@/lib/workspace/db";

const t = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const n = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); const x = Number(v); return v !== "" && Number.isFinite(x) ? x : null; };
/** London wall-clock "YYYY-MM-DD" + "HH:MM" → ISO instant. */
function london(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number), guess = Date.UTC(y, m - 1, d, hh, mm);
  const tz = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "shortOffset" }).formatToParts(new Date(guess)).find(p => p.type === "timeZoneName")?.value ?? "GMT";
  return new Date(guess - Number(tz.match(/GMT([+-]\d+)/)?.[1] ?? 0) * 36e5).toISOString();
}

/** Create or update a team member (add/edit forms). */
export async function saveCrew(id: string | null, fd: FormData): Promise<ActionResult> {
  if (id && !isUuid(id)) return { ok: false, error: "Team member not found." };
  const { db, workspace } = await getProvider();
  const certs = t(fd, "certifications", 600).split("\n").map(l => { const [name, expires] = l.split("|").map(x => x.trim()); return name ? { name: name.slice(0, 60), expires: /^\d{4}-\d{2}-\d{2}$/.test(expires ?? "") ? expires : "" } : null; }).filter(Boolean);
  const p = { name: t(fd, "name", 80), role: t(fd, "role", 60), email: t(fd, "email", 120), phone: t(fd, "phone", 40), location: t(fd, "location", 60), bio: t(fd, "bio", 500),
    skills: t(fd, "skills", 400).split(",").map(s => s.trim()).filter(Boolean).slice(0, 20), day_rate: n(fd, "day_rate"), member_type: id ? undefined : (t(fd, "member_type", 10) || "crew"),
    details: { employment: t(fd, "employment", 20) || "employee", hourly_rate: n(fd, "hourly_rate"), start_date: t(fd, "start_date", 10), timezone: "Europe/London", emergency_contact: t(fd, "emergency_contact", 120),
      certifications: certs, languages: t(fd, "languages", 200).split(",").map(s => s.trim()).filter(Boolean).slice(0, 8) } };
  if (p.name.length < 2) return { ok: false, error: "Enter the person’s name." };
  const { data, error } = await db.rpc("provider_save_crew", { p_ws: workspace.id, p_crew: id, p });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider/team");
  return { ok: true, message: id ? "Team member updated" : "Team member added", redirect: id ? undefined : `/provider/team/${data}` };
}

export async function setCrewStatus(id: string, status: "available" | "unavailable" | "deactivated"): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const { error } = await db.rpc("provider_set_crew_status", { p_ws: workspace.id, p_crew: id, p_status: status });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider/team"); revalidatePath(`/provider/team/${id}`);
  return { ok: true, message: status === "deactivated" ? "Team member deactivated — history is kept" : status === "available" ? "Marked active" : "Marked unavailable" };
}

/** Marks a person unavailable (holiday, sickness…) for a date range. */
export async function addCrewUnavailability(id: string, fd: FormData): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const from = t(fd, "from", 10), to = t(fd, "to", 10) || from, reason = t(fd, "reason", 60) || "Unavailable";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: "Choose the dates." };
  const { error } = await db.rpc("provider_set_availability", { p_ws: workspace.id, p_kind: "blocked", p_starts: london(from, "00:00"), p_ends: london(to, "23:59"), p_crew: id, p_note: reason });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider/team"); revalidatePath(`/provider/team/${id}`);
  return { ok: true, message: `${reason} added` };
}

export async function requestAvailability(fd: FormData): Promise<ActionResult> {
  const { db, workspace } = await getProvider();
  const crew = t(fd, "crew", 40), date = t(fd, "date", 10), from = t(fd, "from", 5) || "09:00", to = t(fd, "to", 5) || "23:00";
  if (!isUuid(crew)) return { ok: false, error: "Choose a team member." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Choose a date." };
  const { error } = await db.rpc("provider_request_availability", { p_ws: workspace.id, p_crew: crew, p_starts: london(date, from), p_ends: london(date, to), p_note: t(fd, "note", 400) });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/provider/team");
  return { ok: true, message: "Availability request sent — it’s tracked in your tasks until they reply", redirect: "/provider/team" };
}
