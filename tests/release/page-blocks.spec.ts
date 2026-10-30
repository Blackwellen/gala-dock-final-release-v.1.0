import { test, expect } from "@playwright/test";
import { BLOCKS, blockOrder } from "../../src/lib/page-blocks";

// Unit-level (no browser, no network): blockOrder keeps a saved page_blocks.order and inserts blocks it doesn't mention — e.g. ones
// added after the order was saved (getting_there, map) — at their default position, after their nearest default predecessor.
const order = (o?: string[]) => blockOrder(o ? { page_blocks: { order: o } } : {});

test.describe("blockOrder", () => {
  test("no saved order → the default layout", () => {
    expect(order()).toEqual([...BLOCKS]);
    expect(blockOrder(null)).toEqual([...BLOCKS]);
  });

  test("a full saved order is kept as saved (hero first)", () => {
    const custom = ["faqs", ...BLOCKS.filter(b => b !== "faqs" && b !== "hero")];
    expect(order(custom)).toEqual(["hero", ...custom]);
  });

  test("blocks missing from an old saved order go after their default predecessor, not last", () => {
    // Saved before getting_there and map existed, with sponsors moved up.
    const old = ["hero", "about", "tickets", "sponsors", "performers", "programme", "venue", "organiser", "accessibility", "gallery", "faqs", "related"];
    const r = order(old);
    expect(r.indexOf("getting_there")).toBe(r.indexOf("venue") + 1);
    expect(r.indexOf("map")).toBe(r.indexOf("getting_there") + 1);
    expect(r.filter(b => b !== "getting_there" && b !== "map")).toEqual(old);
    expect(r).toHaveLength(BLOCKS.length);
  });

  test("predecessor itself missing → walks back to the nearest one present", () => {
    const r = order(["about", "tickets", "related"]);   // venue/getting_there/... all missing
    expect(r.slice(0, 3)).toEqual(["hero", "about", "tickets"]);
    expect(r.indexOf("getting_there")).toBe(r.indexOf("venue") + 1);
    expect(r.at(-1)).toBe("related");
    expect(new Set(r).size).toBe(BLOCKS.length);
  });

  test("unknown and duplicate keys are dropped; hero never moves", () => {
    const r = order(["faqs", "bogus", "faqs", "hero", "about"]);
    expect(r[0]).toBe("hero");
    expect(r.filter(b => b === "faqs")).toHaveLength(1);
    expect(r).not.toContain("bogus" as never);
    expect(r).toHaveLength(BLOCKS.length);
  });
});
