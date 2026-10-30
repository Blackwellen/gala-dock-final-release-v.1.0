import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";
import { VersionedCache } from "../../src/lib/cache/versioned";

// Q06 Search, Cache & Indexing (migration 202610291021). Exit gate: the index is rebuildable and search never leaks unauthorised
// records. Signed-out API on the running app (:3107) + the shared project; fixtures use a unique token so live data is untouched.
const db = admin as unknown as SupabaseClient;
type Id = { id: string };
type Hit = { doc_type: string; doc_id: string; title: string; distance_km: number | null };

test.describe("Q06 cache (unit)", () => {
  test("versioned cache: hits within a version, a version bump invalidates everything, a failing version source bypasses", async () => {
    let v = 1, loads = 0, t = 0, fail = false;
    const c = new VersionedCache(async () => { if (fail) throw new Error("down"); return v; }, { versionTtlMs: 0, ttlMs: 1000, now: () => t });
    const load = async () => ++loads;
    expect((await c.get("s", "k", load)).hit).toBe(false);
    expect(await c.get("s", "k", load)).toMatchObject({ hit: true, value: 1 });
    v = 2; expect(await c.get("s", "k", load)).toMatchObject({ hit: false, value: 2 });
    t = 5000; expect(await c.get("s", "k", load)).toMatchObject({ hit: false, value: 3 });   // ttl expiry
    fail = true; expect(await c.get("s", "k", load)).toMatchObject({ hit: false, version: -1 });
    expect(await c.get("s", "k", load)).toMatchObject({ hit: false });                      // never served while the source is down
  });
});

test.describe("Q06 public search against the index", () => {
  test.describe.configure({ mode: "serial" });
  const tok = `zq${randomBytes(3).toString("hex")}`;
  let owner: { id: string; email: string }, outsider: { id: string; email: string }, provWs: string, orgWs: string;
  let near: string, far: string, hidden: string, live: string, draft: string, priv: string;
  const search = async (q: string, extra = "") => {
    const r = await fetch(`${BASE}/api/public/search?q=${encodeURIComponent(q)}${extra}`);
    expect(r.status).toBe(200);
    const j = await r.json() as { results: Hit[]; organic_only: boolean };
    expect(j.organic_only).toBe(true);
    return j.results;
  };
  test.beforeAll(async () => {
    [owner, outsider] = await Promise.all([createUser("q06-o"), createUser("q06-x")]);
    provWs = await seedWorkspace(owner.id, "provider", `${tok} Sound Co`);
    orgWs = await seedWorkspace(owner.id, "organizer", `${tok} Events`);
    const L = async (name: string, extra: Record<string, unknown>) => ((await db.from("listings").insert({ workspace_id: provWs, name, kind: "service", category: "dj", published: true, response_hours: 4, city: "London", description: "A long enough description for the quality baseline checks.", ...extra }).select("id").single()).data as Id).id;
    near = await L(`${tok} Disc Jockey Hire`, { lat: 51.5072, lng: -0.1276 });
    far = await L(`${tok} Edinburgh DJ`, { lat: 55.9533, lng: -3.1883, city: "Edinburgh" });
    hidden = await L(`${tok} Unpublished DJ`, { published: false, lat: 51.5, lng: -0.12 });
    const E = async (name: string, visibility: string, status: string) => ((await insertEventFixture({ owner_id: owner.id, workspace_id: orgWs, name, visibility, status, starts_at: new Date(Date.now() + 30 * 864e5).toISOString(), city: "London" }, "search").select("id").single()).data as Id).id;
    live = await E(`${tok} Summer Gala`, "public", "on_sale");
    draft = await E(`${tok} Draft Gala`, "public", "draft");
    priv = await E(`${tok} Private Gala`, "private", "on_sale");
  });
  test.afterAll(async () => {
    await db.from("events").delete().in("id", [live, draft, priv]);
    await db.from("listings").delete().in("id", [near, far, hidden]);
    for (const w of [provWs, orgWs]) await db.from("workspaces").delete().eq("id", w);
    await cleanup();
  });

  test("signed-out search returns public records only: drafts, private events and unpublished listings never appear", async () => {
    const ids = (await search(tok)).map(h => h.doc_id);
    expect(ids).toEqual(expect.arrayContaining([near, far, live, provWs, orgWs]));
    for (const x of [hidden, draft, priv]) expect(ids).not.toContain(x);
    // Index rows exist for the hidden records but are flagged non-public (indexed synchronously by the triggers).
    const rows = (await db.from("search_documents").select("doc_id,is_public").in("doc_id", [hidden, draft, priv, near, live])).data as { doc_id: string; is_public: boolean }[];
    expect(Object.fromEntries(rows.map(r => [r.doc_id, r.is_public]))).toEqual({ [hidden]: false, [draft]: false, [priv]: false, [near]: true, [live]: true });
  });

  test("visibility changes apply immediately (no cache window); a stale index row still cannot leak", async () => {
    expect((await search(tok)).map(h => h.doc_id)).toContain(near);
    await db.from("listings").update({ paused_at: new Date().toISOString() }).eq("id", near);
    expect((await search(tok)).map(h => h.doc_id)).not.toContain(near);
    await db.from("listings").update({ paused_at: null }).eq("id", near);
    expect((await search(tok)).map(h => h.doc_id)).toContain(near);
    await db.from("events").update({ visibility: "private" }).eq("id", live);
    expect((await search(tok)).map(h => h.doc_id)).not.toContain(live);
    await db.from("events").update({ visibility: "public" }).eq("id", live);
    // Simulate a stale/corrupted index: mark the draft event public in the index only → still excluded by the live predicate.
    await db.from("search_documents").update({ is_public: true }).eq("doc_type", "event").eq("doc_id", draft);
    await db.rpc("cache_bump", { p_scope: "search:public" });
    expect((await search(tok)).map(h => h.doc_id)).not.toContain(draft);
    expect(((await db.rpc("public_autocomplete", { p_prefix: tok, p_limit: 20 })).data as { label: string }[]).map(s => s.label)).not.toContain(`${tok} Draft Gala`);
  });

  test("index is rebuildable: deleted documents come back from source; reconciliation repairs drift and records a quality baseline", async () => {
    await db.from("search_documents").delete().in("doc_id", [near, far, live, draft]);
    const id = (await db.rpc("enqueue_job", { p_kind: "search.reconcile", p_payload: {}, p_dedupe_key: `q06-test:${tok}:${Date.now()}` })).data as string;
    await db.rpc("run_db_jobs", { p_limit: 5, p_kinds: ["search.reconcile"] });
    const job = (await db.from("job_queue").select("status,result").eq("id", id).single()).data as { status: string; result: { indexed: number; drift: number; quality: { by_flag: Record<string, number>; public_by_type: Record<string, number> } } };
    expect(job.status).toBe("succeeded");
    expect(job.result.indexed).toBeGreaterThan(5);
    expect(job.result.drift).toBeGreaterThanOrEqual(0);                                    // drift is counted per run (another queued reconcile may have repaired first)
    expect(job.result.quality.public_by_type.event).toBeGreaterThan(0);
    const rows = (await db.from("search_documents").select("doc_id,is_public").in("doc_id", [near, far, live, draft])).data as { doc_id: string; is_public: boolean }[];
    expect(Object.fromEntries(rows.map(r => [r.doc_id, r.is_public]))).toEqual({ [near]: true, [far]: true, [live]: true, [draft]: false });
    const run = (await db.from("search_index_runs").select("kind,public_docs,quality").order("id", { ascending: false }).limit(1).single()).data as { kind: string; public_docs: number };
    expect(run.kind).toBe("reconcile"); expect(run.public_docs).toBeGreaterThan(0);
  });

  test("geo radius, synonyms (dj ↔ disc jockey) and autocomplete", async () => {
    const nearOnly = (await search(tok, "&lat=51.5&lng=-0.12&radius_km=40")).map(h => h.doc_id);
    expect(nearOnly).toContain(near); expect(nearOnly).not.toContain(far);
    const withDist = (await search(tok, "&lat=51.5&lng=-0.12&type=service")).find(h => h.doc_id === far);
    expect(Number(withDist?.distance_km)).toBeGreaterThan(500);
    expect((await search(`${tok} dj`, "&type=service")).map(h => h.doc_id)).toEqual(expect.arrayContaining([near, far]));   // "Disc Jockey" matched via synonym
    const ac = await fetch(`${BASE}/api/public/autocomplete?q=${tok}`);
    expect(((await ac.json()) as { suggestions: { label: string }[] }).suggestions.map(s => s.label)).toEqual(expect.arrayContaining([`${tok} Disc Jockey Hire`, `${tok} Summer Gala`]));
    expect((await fetch(`${BASE}/api/public/search?q=x&type=secret`)).status).toBe(400);
    expect((await fetch(`${BASE}/api/public/search?q=x&lat=91&lng=0`)).status).toBe(400);
  });

  test("permission-aware in-app search and service-only internals", async () => {
    const o = await signedIn(owner.email) as unknown as SupabaseClient, x = await signedIn(outsider.email) as unknown as SupabaseClient;
    const ids = async (c: SupabaseClient) => (((await c.rpc("global_search", { p_q: tok, p_workspace: null, p_limit: 50 })).data ?? []) as { id: string }[]).map(r => r.id);
    expect(await ids(o)).toEqual(expect.arrayContaining([priv, draft]));                    // the owner finds their own private/draft records
    const seen = await ids(x);
    for (const id of [priv, draft, hidden]) expect(seen).not.toContain(id);                // an outsider never does
    for (const fn of ["public_search", "public_autocomplete", "search_rebuild", "search_index_document", "cache_bump"])
      expect((await (anon() as unknown as SupabaseClient).rpc(fn, { p_q: tok })).error, fn).not.toBeNull();
    expect(((await anon().from("search_documents" as never).select("doc_id").limit(1)).data ?? []).length).toBe(0);
    expect(((await x.from("search_documents" as never).select("doc_id").limit(1)).data ?? []).length).toBe(0);
  });
});
