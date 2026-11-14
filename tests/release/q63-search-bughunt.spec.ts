import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN_SEAT, errorMessage, groupHits, isSearchable, moveActive, normaliseQuery, parseRecents, pushRecent, recentKey, safeLink, searchUrl, shortcutLabel, type SearchHit } from "../../src/lib/search/global";

// Q63 global search bug hunt (Phase A, code + DB). Pure helpers + source checks only: no network, no dev server.
// The DB half (isolation per seat, paused listings, wildcard escaping, links, ranking, typo tolerance, admin search) is exercised by
// scripts/db/exercises/202611146631_global_search_bughunt.sql and scripts/qa/search-isolation.mjs (→ artifacts/release/q63-search-isolation.json).
const src = (f: string) => readFileSync(f, "utf8");
const hit = (kind: string, id: string, link = `/x/${id}`): SearchHit => ({ kind, id, title: `${kind} ${id}`, subtitle: "", link });
const WS = "75e6c471-8d5e-4b9f-b076-ff10cf209f01";

test("keyboard order = visual order: hits interleaved by score are grouped, and the flat list follows the rendered groups", () => {
  const { groups, flat } = groupHits([hit("event", "1"), hit("venue", "2"), hit("event", "3"), hit("ticket", "4"), hit("venue", "5")]);
  expect(groups.map(g => g.kind)).toEqual(["event", "venue", "ticket"]);              // groups ordered by their best hit
  expect(flat.map(h => h.id)).toEqual(["1", "3", "2", "5", "4"]);                     // was API order 1,2,3,4,5 → ↓ jumped between groups
  expect(groups.map(g => g.label)).toEqual(["Events", "Venues", "Tickets"]);
});

test("duplicates and link-less hits are dropped; unknown kinds get a readable label", () => {
  const { groups, flat } = groupHits([hit("event", "1"), hit("event", "1"), { ...hit("file", "2"), link: "" }, hit("widget", "3")]);
  expect(flat.map(h => h.id)).toEqual(["1", "3"]);
  expect(groups.find(g => g.kind === "widget")?.label).toBe("Widget");
  expect(groupHits([hit("contract", "1"), hit("user", "2"), hit("case", "3"), hit("person", "4")]).groups.map(g => g.label)).toEqual(["Contracts", "Users", "Support cases", "Guests"]);
});

test("arrow keys wrap and start from the edge when nothing is active; no options → nothing active", () => {
  expect(moveActive(-1, 1, 4)).toBe(0);
  expect(moveActive(-1, -1, 4)).toBe(3);
  expect(moveActive(3, 1, 4)).toBe(0);
  expect(moveActive(0, -1, 4)).toBe(3);
  expect(moveActive(1, 1, 4)).toBe(2);
  expect(moveActive(2, 1, 0)).toBe(-1);
});

test("request URL: seat → ws (uuid only), admin → scope=admin, personal → neither; query normalised and encoded", () => {
  expect(searchUrl("  summer   gala ", WS)).toBe(`/api/search?q=summer+gala&ws=${WS}`);
  expect(searchUrl("a&b=c", null)).toBe("/api/search?q=a%26b%3Dc");                     // was raw `&ws=${seat}` concatenation
  expect(searchUrl("gala", ADMIN_SEAT)).toBe("/api/search?q=gala&scope=admin");
  expect(searchUrl("gala", "not-a-uuid&x=1")).toBe("/api/search?q=gala");
  expect(normaliseQuery("x".repeat(200))).toHaveLength(80);
  expect(isSearchable(" a ")).toBe(false);
  expect(isSearchable("ab")).toBe(true);
});

test("error states are distinct from 'no results' and never echo the server error", () => {
  expect(errorMessage(429)).toMatch(/fast/);
  expect(errorMessage(403)).toMatch(/access/);
  expect(errorMessage(401)).toMatch(/Sign in/);
  expect(errorMessage(500)).toMatch(/isn't available/);
  expect(errorMessage(0)).toMatch(/isn't available/);
});

test("shortcut hint matches the platform (was ⌘K on Windows)", () => {
  expect(shortcutLabel("MacIntel")).toBe("⌘K");
  expect(shortcutLabel("iPhone")).toBe("⌘K");
  expect(shortcutLabel("Win32")).toBe("Ctrl K");
  expect(shortcutLabel("Linux x86_64")).toBe("Ctrl K");
});

test("recents: per seat, newest first, deduped, capped, internal links only, people records never stored", () => {
  expect(recentKey(null)).toBe("gd_gs_recent:personal");
  expect(recentKey(WS)).toBe(`gd_gs_recent:${WS}`);
  let list: SearchHit[] = [];
  for (let i = 0; i < 9; i++) list = pushRecent(list, hit("event", String(i)));
  expect(list.map(h => h.id)).toEqual(["8", "7", "6", "5", "4", "3"]);
  list = pushRecent(list, hit("event", "5"));
  expect(list.map(h => h.id)).toEqual(["5", "8", "7", "6", "4", "3"]);
  expect(pushRecent([], hit("person", "g1"))).toEqual([]);
  expect(pushRecent([], hit("client", "c1"))).toEqual([]);
  expect(pushRecent([], { ...hit("event", "e"), link: "https://evil.example/x" })).toEqual([]);
  expect(pushRecent([], { ...hit("event", "e"), link: "//evil.example" })).toEqual([]);
  expect(safeLink("/\\evil.example")).toBe(false);
  expect(parseRecents("not json")).toEqual([]);
  expect(parseRecents(JSON.stringify({ a: 1 }))).toEqual([]);
  expect(parseRecents(JSON.stringify([hit("event", "1"), { ...hit("event", "2"), link: "javascript:alert(1)" }, hit("user", "3"), { kind: 1 }])).map(h => h.id)).toEqual(["1"]);
});

test("component: stale responses can't overwrite newer ones, loading isn't 'no results', unique ids, visible-only ⌘K, option semantics", () => {
  const c = src("src/components/search/global-search.tsx");
  expect(c).toMatch(/ctl\.abort\(\)/);
  expect(c).toMatch(/if \(ctl\.signal\.aborted\) return;/);
  expect(c).toMatch(/settled = searchable && result\.key === key/);                   // results are keyed by seat|query
  expect(c).toMatch(/r\.ok \?/);                                                      // non-2xx → error state (was silently "No results")
  expect(c).toMatch(/useId\(\)/);                                                     // desktop + phone instances no longer share id="gs-list"
  expect(c).toMatch(/getClientRects\(\)\.length === 0/);                              // hidden instance ignores ⌘K
  expect(c).toMatch(/e\.defaultPrevented/);
  expect(c).toMatch(/role="option"/);
  expect(c).not.toMatch(/<button[^>]*role="option"/);
  expect(c).toMatch(/aria-activedescendant=\{showPanel && current/);
  expect(c).toMatch(/role="status" aria-live="polite"/);
  expect(c).toMatch(/!searchable \|\| settled/);                                     // Enter never opens a stale result
  expect(src("src/components/pwa.tsx")).toMatch(/gd_gs_recent:/);                     // recents cleared on sign-out
  expect(src("src/components/workspace/shell.tsx").match(/seat(=\{|: )ADMIN_SEAT/g)?.length).toBe(2);   // admin desktop + phone
});

test("route: admin scope calls admin_global_search; radius is rounded to the integer the RPC takes (was a 500)", () => {
  const r = src("src/app/api/search/route.ts");
  expect(r).toMatch(/admin_global_search/);
  expect(r).toMatch(/Math\.round\(r\)/);
  expect(r).toMatch(/rateLimit\(`search:\$\{user\.id\}`/);
  expect(r).toMatch(/private, no-store/);
});

test("migration: the reviewed fixes are present", () => {
  const m = src("supabase/migrations/202611146631_global_search_bughunt.sql");
  expect(m).toMatch(/search_listing_is_public\(l\) and not public\.demo_hidden_for_viewer/);
  expect(m).toMatch(/search_like_escape/);
  expect(m).toMatch(/'\/organizer\/sales\/proposals\/' \|\| pr\.id/);
  expect(m).toMatch(/from public\.clients cl/);
  expect(m).not.toMatch(/'\/organizers\/' \|\|/);
  expect(m).toMatch(/t\.replaced_by is null/);
  expect(m).toMatch(/if not public\.is_platform_admin\(\) then raise exception 'not_authorized'/);
  expect(m).toMatch(/revoke all on function public\.admin_global_search\(text, integer\) from public, anon/);
  expect(m).toMatch(/revoke all on function public\.global_search\(text, uuid, integer, double precision, double precision, integer\) from public, anon/);
});
