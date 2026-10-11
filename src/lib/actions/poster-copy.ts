"use server";
import { z } from "zod";
import { getOrganizer } from "@/lib/data/context";
import { chat, SAFETY, agentConfigured } from "@/lib/agent/llm";
import { rateLimit } from "@/lib/security";

const In = z.object({ event_id: z.string().uuid() });
export type PosterCopy = { tagline: string; strap: string };

/** Suggests poster copy (tagline + strapline) from the event's own record. Read-only; nothing is saved. */
export async function suggestPosterCopy(input: unknown): Promise<{ ok: true; copy: PosterCopy } | { ok: false; error: string }> {
  const p = In.safeParse(input); if (!p.success) return { ok: false, error: "Unknown event." };
  const ctx = await getOrganizer();
  if (!(await rateLimit(`poster-copy:${ctx.user.id}`, 12, 600))) return { ok: false, error: "Too many requests — try again in a few minutes." };
  const { data: e } = await ctx.supabase.from("events").select("name,description,tags,venue_name,location").eq("id", p.data.event_id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  const { data: zones } = await ctx.supabase.from("programme_items").select("area").eq("event_id", p.data.event_id).not("area", "is", null).limit(20);
  const areas = [...new Set((zones ?? []).map(z => z.area).filter(Boolean))].slice(0, 4) as string[];
  const fallback: PosterCopy = { tagline: (e.tags?.length ? e.tags.slice(0, 4) : ["Music", "Lights", "People", "Summer Vibes"]).join(" • "), strap: areas.join(" • ") };
  if (!agentConfigured()) return { ok: true, copy: fallback };
  try {
    const r = await chat([{ role: "system", content: `${SAFETY}\nYou write short, punchy event poster copy. Reply as JSON {"tagline": string (2-5 words separated by " • ", max 45 chars), "strap": string (up to 4 areas or highlights separated by " • ", max 50 chars)}.` },
      { role: "user", content: `<data>${JSON.stringify({ name: e.name, description: (e.description ?? "").slice(0, 600), tags: e.tags, venue: e.venue_name, areas })}</data>` }], { model: "nano", maxTokens: 200, json: true });
    const j = JSON.parse(r.text) as Partial<PosterCopy>;
    const clean = (s: unknown, n: number) => typeof s === "string" ? s.replace(/[<>]/g, "").trim().slice(0, n) : "";
    return { ok: true, copy: { tagline: clean(j.tagline, 60) || fallback.tagline, strap: clean(j.strap, 60) || fallback.strap } };
  } catch { return { ok: true, copy: fallback }; }
}
