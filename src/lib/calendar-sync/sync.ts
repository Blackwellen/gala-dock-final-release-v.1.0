import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { openTokens, refreshTokens, sealTokens, type Provider, type Tokens } from "./providers";

type Conn = { id: string; user_id: string; provider: Provider; token_enc: string; calendar_id: string | null };
type FeedRow = { uid: string; title: string; starts_at: string; ends_at: string | null; location: string | null; kind: string };
type Admin = ReturnType<typeof createAdminClient>;

const DAY = 864e5, PAST = 7 * DAY, AHEAD = 180 * DAY;
const GCAL = "https://www.googleapis.com/calendar/v3", GRAPH = "https://graph.microsoft.com/v1.0";

async function api(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(`${res.status}`) as Error & { status: number }; e.status = res.status; throw e; }
  return j as Record<string, unknown>;
}

const endOf = (r: FeedRow) => r.ends_at ?? new Date(Date.parse(r.starts_at) + 4 * 36e5).toISOString();
const titleOf = (r: FeedRow) => (r.kind === "ticket" ? `🎟 ${r.title}` : r.title);
const hashOf = (r: FeedRow) => createHash("sha1").update([titleOf(r), r.starts_at, endOf(r), r.location ?? ""].join("|")).digest("hex");

const google = {
  ensureCalendar: async (t: string, id: string | null) => {
    if (id) { try { await api(t, `${GCAL}/calendars/${encodeURIComponent(id)}`); return id; } catch (e) { if ((e as { status?: number }).status !== 404) throw e; } }
    const c = await api(t, `${GCAL}/calendars`, { method: "POST", body: JSON.stringify({ summary: "Gala Dock", description: "Your Gala Dock events and tickets (managed by Gala Dock)." }) });
    return String(c!.id);
  },
  body: (r: FeedRow) => JSON.stringify({ summary: titleOf(r), location: r.location ?? "", start: { dateTime: r.starts_at }, end: { dateTime: endOf(r) }, source: { title: "Gala Dock", url: "https://www.galadock.com" } }),
  create: async (t: string, cal: string, r: FeedRow) => String((await api(t, `${GCAL}/calendars/${encodeURIComponent(cal)}/events`, { method: "POST", body: google.body(r) }))!.id),
  update: (t: string, cal: string, id: string, r: FeedRow) => api(t, `${GCAL}/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(id)}`, { method: "PUT", body: google.body(r) }),
  remove: (t: string, cal: string, id: string) => api(t, `${GCAL}/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(id)}`, { method: "DELETE" }),
  busy: async (t: string, from: string, to: string) => {
    const j = await api(t, `${GCAL}/freeBusy`, { method: "POST", body: JSON.stringify({ timeMin: from, timeMax: to, items: [{ id: "primary" }] }) }) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
    return j.calendars?.primary?.busy ?? [];
  },
};

const microsoft = {
  ensureCalendar: async (t: string, id: string | null) => {
    if (id) { try { await api(t, `${GRAPH}/me/calendars/${encodeURIComponent(id)}`); return id; } catch (e) { if ((e as { status?: number }).status !== 404) throw e; } }
    const c = await api(t, `${GRAPH}/me/calendars`, { method: "POST", body: JSON.stringify({ name: "Gala Dock" }) });
    return String(c!.id);
  },
  body: (r: FeedRow) => JSON.stringify({ subject: titleOf(r), location: { displayName: r.location ?? "" }, start: { dateTime: r.starts_at.slice(0, 19), timeZone: "UTC" }, end: { dateTime: new Date(endOf(r)).toISOString().slice(0, 19), timeZone: "UTC" }, showAs: "busy" }),
  create: async (t: string, cal: string, r: FeedRow) => String((await api(t, `${GRAPH}/me/calendars/${encodeURIComponent(cal)}/events`, { method: "POST", body: microsoft.body(r) }))!.id),
  update: (t: string, _cal: string, id: string, r: FeedRow) => api(t, `${GRAPH}/me/events/${encodeURIComponent(id)}`, { method: "PATCH", body: microsoft.body(r) }),
  remove: (t: string, _cal: string, id: string) => api(t, `${GRAPH}/me/events/${encodeURIComponent(id)}`, { method: "DELETE" }),
  busy: async (t: string, from: string, to: string) => {
    // Default calendar only, so our own "Gala Dock" calendar never echoes back as busy time.
    const q = new URLSearchParams({ startDateTime: from, endDateTime: to, $select: "start,end,showAs,isCancelled", $top: "500" });
    const j = await api(t, `${GRAPH}/me/calendar/calendarView?${q}`, { headers: { Prefer: 'outlook.timezone="UTC"' } }) as { value?: { start: { dateTime: string }; end: { dateTime: string }; showAs: string; isCancelled: boolean }[] };
    return (j.value ?? []).filter(e => !e.isCancelled && e.showAs !== "free").map(e => ({ start: `${e.start.dateTime.slice(0, 19)}Z`, end: `${e.end.dateTime.slice(0, 19)}Z` }));
  },
};
const IMPL = { google, microsoft };

/** One connection: refresh the token, push Gala Dock events into the dedicated calendar (create/update/delete by mapping),
 *  then replace the busy blocks for the window. Errors mark the connection; a revoked grant (400/401 on refresh) → revoked. */
export async function syncConnection(admin: Admin, c: Conn) {
  const p = IMPL[c.provider];
  try {
    let tok: Tokens = openTokens(c.token_enc);
    if (tok.expires_at < Date.now() + 60e3) {
      try { tok = await refreshTokens(c.provider, tok); } catch {
        await admin.from("calendar_connections").update({ status: "revoked", last_error: "Access was revoked. Reconnect to resume syncing.", updated_at: new Date().toISOString() }).eq("id", c.id);
        return { id: c.id, ok: false, error: "revoked" };
      }
      await admin.from("calendar_connections").update({ token_enc: sealTokens(tok) }).eq("id", c.id);
    }
    const t = tok.access_token;
    const cal = await p.ensureCalendar(t, c.calendar_id);
    if (cal !== c.calendar_id) { await admin.from("calendar_sync_links").delete().eq("connection_id", c.id); await admin.from("calendar_connections").update({ calendar_id: cal }).eq("id", c.id); }

    const now = Date.now(), from = new Date(now - PAST).toISOString(), to = new Date(now + AHEAD).toISOString();
    const { data: feed } = await admin.rpc("calendar_feed_for_user", { p_user: c.user_id });
    const rows = ((feed ?? []) as FeedRow[]).filter(r => r.starts_at >= from && r.starts_at < to).slice(0, 400);
    const { data: links } = await admin.from("calendar_sync_links").select("source_uid,external_id,content_hash").eq("connection_id", c.id);
    const have = new Map((links ?? []).map(l => [l.source_uid, l]));
    let pushed = 0, removed = 0;
    for (const r of rows) {
      const l = have.get(r.uid); have.delete(r.uid); const h = hashOf(r);
      if (l?.content_hash === h) continue;
      let ext = l?.external_id;
      if (ext) { try { await p.update(t, cal, ext, r); } catch (e) { if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 410) ext = undefined; else throw e; } }
      if (!ext) ext = await p.create(t, cal, r);
      await admin.from("calendar_sync_links").upsert({ connection_id: c.id, source_uid: r.uid, external_id: ext, content_hash: h });
      pushed++;
    }
    // Anything still mapped but no longer in the feed (cancelled, deleted, ticket refunded, outside window) is removed.
    for (const [uid, l] of have) {
      await p.remove(t, cal, l.external_id).catch(e => { if (![404, 410].includes((e as { status?: number }).status ?? 0)) throw e; });
      await admin.from("calendar_sync_links").delete().eq("connection_id", c.id).eq("source_uid", uid); removed++;
    }

    const busy = (await p.busy(t, from, to)).filter(b => Date.parse(b.end) > Date.parse(b.start)).slice(0, 1000);
    await admin.from("calendar_busy_blocks").delete().eq("connection_id", c.id);
    if (busy.length) await admin.from("calendar_busy_blocks").insert(busy.map(b => ({ connection_id: c.id, user_id: c.user_id, starts_at: b.start, ends_at: b.end })));
    await admin.from("calendar_connections").update({ status: "active", last_error: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", c.id);
    return { id: c.id, ok: true, pushed, removed, busy: busy.length };
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = status === 403 ? "Calendar permission missing. Reconnect and allow calendar access." : "Sync failed. We'll retry automatically.";
    await admin.from("calendar_connections").update({ status: "error", last_error: msg, updated_at: new Date().toISOString() }).eq("id", c.id);
    return { id: c.id, ok: false, error: String((e as Error).message).slice(0, 80) };
  }
}

export async function syncUser(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("calendar_connections").select("id,user_id,provider,token_enc,calendar_id").eq("user_id", userId).neq("status", "revoked");
  return Promise.all(((data ?? []) as Conn[]).map(c => syncConnection(admin, c)));
}

export async function syncDue(limit = 25) {
  const admin = createAdminClient();
  const { data } = await admin.from("calendar_connections").select("id,user_id,provider,token_enc,calendar_id").neq("status", "revoked").order("last_synced_at", { ascending: true, nullsFirst: true }).limit(limit);
  const out = [];
  for (const c of (data ?? []) as Conn[]) out.push(await syncConnection(admin, c));
  return { synced: out.filter(o => o.ok).length, failed: out.filter(o => !o.ok).length };
}
