// Q55 · Creative builders bug hunt (design studio, poster builder, templates, venue/event plan builder, seat maps).
// Pure unit specs (no browser, no database) for the helpers the fixes rely on, plus source guards for UI-only fixes.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { planSeats, pruneSeatMaps, remapBlock, remapTable, seatCounts } from "../../src/components/venue-plan/inventory";
import { DEFAULT_SEATING, type Seating, type TableSpec } from "../../src/components/venue-plan/assets";
import { safeUnderlayUrlFor } from "../../src/lib/maps/underlay";
import { cssFontUrls, usedFaceCss } from "../../src/lib/media/document";
import { cleanPhotoAlts, photoAlt } from "../../src/lib/media/photo-alt";
import { profileFieldError } from "../../src/lib/settings/rules";
import type { MapEl } from "../../src/app/provider/venues/_components/venue-map";

const src = (p: string) => readFileSync(p, "utf8");
const block = (p: Partial<Seating> = {}, extra: Partial<MapEl> = {}): MapEl => ({ type: "asset", asset: "seat_block", id: "b1", label: "Block A", x: 0, y: 0, seating: { ...DEFAULT_SEATING, rows: 2, cols: 3, prefix: "A", ...p }, ...extra });
const table = (t: Partial<TableSpec> = {}, extra: Partial<MapEl> = {}): MapEl => ({ type: "asset", asset: "round_table", id: "t1", label: "Table 1", x: 0, y: 0, table: { shape: "round", seats: 4, number: "1", seatStyle: "numeric", ...t }, ...extra });

test.describe("seat flags and tiers follow the physical seat (remap on edit)", () => {
  test("renaming a block keeps accessible / blocked flags and per-seat tiers on the same seats", () => {
    const prev = block().seating!, next = { ...prev, prefix: "B" };
    const r = remapBlock(prev, next, { seatFlags: { "A-A-1": "accessible", "A-B-3": "blocked" }, seatTiers: { "A-A-2": "vip" } });
    expect(r.seatFlags).toEqual({ "B-A-1": "accessible", "B-B-3": "blocked" });
    expect(r.seatTiers).toEqual({ "B-A-2": "vip" });
  });
  test("relabelling rows as numbers and reversing seat order re-keys by position", () => {
    const prev = block().seating!, next: Seating = { ...prev, rowStyle: "numeric", colDir: "rtl" };
    // Front-left seat A-A-1 (row 0, col 0) becomes row "1", and with right-to-left numbering its seat number is 3.
    expect(remapBlock(prev, next, { seatFlags: { "A-A-1": "companion" } }).seatFlags).toEqual({ "A-1-3": "companion" });
  });
  test("shrinking a block drops flags for seats that no longer exist", () => {
    const prev = block().seating!, next = { ...prev, cols: 2 };
    expect(remapBlock(prev, next, { seatFlags: { "A-A-1": "blocked", "A-A-3": "blocked" } }).seatFlags).toEqual({ "A-A-1": "blocked" });
  });
  test("renumbering a table keeps flags per chair; nothing to remap returns no keys (never the element)", () => {
    const r = remapTable(table().table!, { ...table().table!, number: "7" }, { seatFlags: { "T1-2": "accessible" } });
    expect(r).toEqual({ seatFlags: { "T7-2": "accessible" } });
    expect(remapBlock(block().seating!, { ...block().seating!, prefix: "C" }, {})).toEqual({});
  });
});

test.describe("seat counts match the saved inventory", () => {
  test("stale flags are pruned before save and don't reduce counts", () => {
    const el = block({}, { seatFlags: { "A-A-1": "blocked", "Z-Z-9": "blocked", "OLD-1": "accessible" }, seatTiers: { "A-A-2": "t", "GONE": "t" } });
    const [pruned] = pruneSeatMaps([el]);
    expect(pruned!.seatFlags).toEqual({ "A-A-1": "blocked" });
    expect(pruned!.seatTiers).toEqual({ "A-A-2": "t" });
    expect(seatCounts([el])).toMatchObject({ seats: 6, blocked: 1, sellable: 5 });
  });
  test("hidden elements count for nothing (planSeats skips them too); tables subtract blocked chairs", () => {
    const els = [block({}, { hidden: true }), table({}, { seatFlags: { "T1-1": "blocked" } })];
    expect(seatCounts(els)).toMatchObject({ seats: 0, tableSeats: 4, tables: 1, blocked: 1, sellable: 3 });
    expect(planSeats(els).filter(s => !s.blocked).length).toBe(3);
  });
  test("elements without seat maps are returned unchanged by pruning", () => {
    const el: MapEl = { type: "asset", asset: "bar", label: "Bar" };
    expect(pruneSeatMaps([el])[0]).toBe(el);
  });
});

test.describe("plan underlays only load from our store or same-site paths", () => {
  const store = "https://abcdefghijklmnop.supabase.co/storage/v1/object/public/";
  test("allowed", () => {
    expect(safeUnderlayUrlFor(store, `${store}listing-media/ws/plan.png`)).toBeTruthy();
    expect(safeUnderlayUrlFor(store, "/assets/gd/plan.webp")).toBe("/assets/gd/plan.webp");
  });
  test("refused: protocol-relative, backslash tricks, whitespace, traversal, other schemes", () => {
    for (const u of ["//evil.example/x.png", "/\\evil.example/x.png", "/\\/evil.example/x.png", "/\t/evil.example/x.png", " /assets/x.png",
      `${store}../../../auth/v1/x`, "https://evil.example/x.png", "javascript:alert(1)", "data:image/svg+xml,<svg/>", "", undefined])
      expect(safeUnderlayUrlFor(store, u)).toBeUndefined();
  });
});

test.describe("studio exports embed uploaded brand fonts", () => {
  test("font URLs to inline include same-origin /api/media/font files as well as Google font files", () => {
    const id = "0b8f0a2e-4c1d-4b7a-9e3f-1a2b3c4d5e6f";
    const css = `@font-face{font-family:"Acme";src:url(/api/media/font?id=${id});font-weight:400}\n@font-face{src:url(https://fonts.gstatic.com/s/inter/v1/a.woff2) format('woff2')}\n@font-face{src:url("https://fonts.gstatic.com/s/inter/v1/a.woff2")}`;
    expect(cssFontUrls(css)).toEqual([`/api/media/font?id=${id}`, "https://fonts.gstatic.com/s/inter/v1/a.woff2"]);
    expect(cssFontUrls("src:url(/api/media/font?id=../../etc)")).toEqual([]);
  });
  test("only faces for families the page uses are embedded", () => {
    const faces = `@font-face{font-family:"Acme";src:url(/api/media/font?id=1);font-weight:400}\n@font-face{font-family:"Other";src:url(/api/media/font?id=2)}`;
    expect(usedFaceCss(faces, ["acme", "Inter"])).toContain("Acme");
    expect(usedFaceCss(faces, ["acme", "Inter"])).not.toContain("Other");
    expect(usedFaceCss("", ["Acme"])).toBe("");
  });
  test("the exporter passes the Brand tab faces through to every render", () => {
    expect(src("src/components/media/export.ts")).toMatch(/usedFaceCss\(faces/);
    expect(src("src/components/media/studio.tsx")).toMatch(/exportDesign\(nodes, list, format, \{[^}]*faces/);
  });
});

test.describe("listing photo alt text", () => {
  test("kept only for current photos, single-line, capped, blanks dropped", () => {
    const r = cleanPhotoAlts(["a.jpg", "b.jpg"], { "a.jpg": "  Main hall\nset for dinner  ", "b.jpg": "   ", "gone.jpg": "x", "c": 3 });
    expect(r).toEqual({ "a.jpg": "Main hall set for dinner" });
    expect(cleanPhotoAlts(["a"], { a: "x".repeat(400) }).a).toHaveLength(140);
    expect(cleanPhotoAlts(["a"], null)).toEqual({}); expect(cleanPhotoAlts(["a"], ["x"])).toEqual({});
  });
  test("public pages use the provider's text, else a neutral fallback", () => {
    expect(photoAlt({ photo_alt: { "a.jpg": "Garden terrace" } }, "a.jpg", "Venue photo 1")).toBe("Garden terrace");
    expect(photoAlt({}, "a.jpg", "Venue photo 1")).toBe("Venue photo 1");
    expect(photoAlt(null, "a.jpg", "F")).toBe("F");
  });
});

test("customer profile errors name the field that failed", () => {
  expect(profileFieldError("bio")).toMatch(/250/);
  expect(profileFieldError("country")).toMatch(/country/i);
  expect(profileFieldError("language")).toMatch(/language/i);
  expect(profileFieldError("nope")).toBe("Check your details and try again.");
  expect(src("src/lib/actions/account.ts")).toMatch(/profileFieldError\(String\(p\.error\.issues\[0\]\?\.path\[0\]/);
});

test.describe("source guards for UI fixes", () => {
  test("poster CTA label is drawn (a trailing comment used to swallow the fillText call)", () => {
    const line = src("src/components/organizer/poster-builder.tsx").split("\n").find(l => l.includes('fillText("BUY TICKETS'))!;
    expect(line).toBeTruthy();
    expect(line.indexOf("//") === -1 || line.indexOf("//") > line.indexOf('fillText("BUY TICKETS')).toBe(true);
  });
  test("plan builder: undo/redo mark the plan dirty and clear index selection; a save only clears dirty if nothing changed meanwhile", () => {
    const s = src("src/components/venue-plan/plan-builder.tsx");
    expect(s).toMatch(/const undo = useCallback\([^\n]*setSel\(\[\]\)[^\n]*setDirty\(true\)/);
    expect(s).toMatch(/const redo = useCallback\([^\n]*setSel\(\[\]\)[^\n]*setDirty\(true\)/);
    expect(s).toMatch(/if \(r\.ok && latestEls\.current === snapshot\) setDirty\(false\)/);
    expect(s).toMatch(/remapBlock\(s\.seating, ns, s\)/); expect(s).toMatch(/remapTable\(s\.table, nt, s\)/);
  });
  test("studio: undo/redo clamp the page index; publishing adopts the saved version; leaving warns/saves", () => {
    const s = src("src/components/media/studio.tsx");
    expect(s).toMatch(/setPageIdx\(i => Math\.max\(0, Math\.min\(i, next\.pages\.length - 1\)\)\)/);
    expect(s).toMatch(/onSaved=\{v => \{ version\.current = v; \}\}/);
    expect(s).toMatch(/addEventListener\("beforeunload", h\)/);
    expect(src("src/lib/media/actions.ts")).toMatch(/version: savedVersion/);
    expect(src("src/lib/media/actions.ts")).toMatch(/design_active_content\|template_active_content/);
  });
  test("photo manager: compact Change cover puts the new photo first", () => {
    expect(src("src/app/provider/venues/_components/photo-manager.tsx")).toMatch(/cover \? \[added\[0\]!, \.\.\.photos, \.\.\.added\.slice\(1\)\]/);
  });
  test("event and venue plan saves prune stale seat maps", () => {
    expect(src("src/app/organizer/events/[id]/map/actions.ts").match(/pruneSeatMaps\(overlay\)/g)).toHaveLength(2);
    expect(src("src/app/provider/venues/[id]/actions.ts")).toMatch(/pruneSeatMaps\(elements\)/);
  });
  test("seat capacity migration: tables subtract blocked chairs like seat blocks", () => {
    const m = src("supabase/migrations/202611149551_q55_builders_seat_capacity.sql");
    expect(m).toMatch(/create or replace function public\.map_el_seats\(e jsonb\)/);
    expect(m.match(/f\.value = 'blocked'/g)).toHaveLength(2);
  });
});
