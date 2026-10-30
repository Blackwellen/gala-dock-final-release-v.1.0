// Q19 · stale-version reload-merge (src/lib/maps/merge.ts) used by the venue structure editor and the ORG-013 event map editor.
// Pure unit spec: no browser, no database.
import { test, expect } from "@playwright/test";
import { mergeElements, staleVersion } from "../../src/lib/maps/merge";

type El = { id?: string; type: string; label: string; x?: number; y?: number; capacity?: number };
const el = (id: string, x = 0, extra: Partial<El> = {}): El => ({ id, type: "asset", label: id.toUpperCase(), x, y: 0, ...extra });

test.describe("map reload-merge", () => {
  test("disjoint edits from both sessions are all kept", () => {
    const base = [el("stage"), el("bar"), el("ga", 0, { capacity: 500 })];
    const mine = [el("stage", 10), el("bar"), el("ga", 0, { capacity: 500 }), el("vip")];          // moved stage, added vip
    const theirs = [el("stage"), el("bar", 5), el("ga", 0, { capacity: 600 }), el("toilets")];     // moved bar, changed GA, added toilets
    const r = mergeElements(base, mine, theirs);
    expect(r.conflicts).toEqual([]);
    const by = Object.fromEntries(r.elements.map(e => [e.id, e]));
    expect(by.stage.x).toBe(10); expect(by.bar.x).toBe(5); expect(by.ga.capacity).toBe(600);
    expect(Object.keys(by).sort()).toEqual(["bar", "ga", "stage", "toilets", "vip"]);
    expect(r.added).toEqual({ mine: 1, theirs: 1 });
  });
  test("the same element changed differently on both sides: mine wins and it is reported", () => {
    const r = mergeElements([el("ga", 0, { capacity: 500 })], [el("ga", 0, { capacity: 450 })], [el("ga", 0, { capacity: 700 })]);
    expect(r.elements).toEqual([el("ga", 0, { capacity: 450 })]);
    expect(r.conflicts).toEqual(["GA"]);
  });
  test("identical changes on both sides are not a conflict and are kept once", () => {
    const r = mergeElements([el("a")], [el("a", 3)], [el("a", 3)]);
    expect(r.elements).toEqual([el("a", 3)]); expect(r.conflicts).toEqual([]);
  });
  test("deletions: an untouched element deleted on one side goes; deleted vs edited is kept and reported", () => {
    const base = [el("a"), el("b"), el("c")];
    const r1 = mergeElements(base, [el("b"), el("c")], base);                    // I deleted a, they didn't touch it
    expect(r1.elements.map(e => e.id)).toEqual(["b", "c"]); expect(r1.removed.mine).toBe(1);
    const r2 = mergeElements(base, [el("b"), el("c")], [el("a", 9), el("b"), el("c")]);   // I deleted a, they edited it
    expect(r2.elements.map(e => e.id)).toEqual(["a", "b", "c"]); expect(r2.conflicts).toEqual(["A"]);
    const r3 = mergeElements(base, [el("a"), el("b", 4), el("c")], [el("a"), el("c")]);  // they deleted b, I edited it
    expect(r3.elements.map(e => e.id).sort()).toEqual(["a", "b", "c"]); expect(r3.conflicts).toEqual(["B"]);
  });
  test("legacy elements without ids match by type + label + position in the list", () => {
    const base = [{ type: "exit", label: "Exit 1" }], mine = [{ type: "exit", label: "Exit 1" }], theirs = [{ type: "exit", label: "Exit 1" }, { type: "exit", label: "Exit 2" }];
    expect(mergeElements(base, mine, theirs).elements).toHaveLength(2);
  });
  test("stale_version parsing", () => {
    expect(staleVersion("stale_version:7")).toBe(7);
    expect(staleVersion("ERROR: stale_version:12 (hint)")).toBe(12);
    expect(staleVersion("venue_lock")).toBeNull(); expect(staleVersion(undefined)).toBeNull();
  });
});
