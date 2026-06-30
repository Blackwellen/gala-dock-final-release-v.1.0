import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCapacity, ratiosFor } from "@/lib/events/capacity";

test("oversell + understaffed warnings", () => {
  const r = computeCapacity({ capacity: 100, headcount: 120, staffCount: 1 });
  assert.equal(r.oversell, true);
  assert.equal(r.occupancyPct, 120);
  assert.equal(r.recommendedStaff, 2);
  assert.ok(r.warnings.some((w) => /Oversell/.test(w)));
  assert.ok(r.warnings.some((w) => /Understaffed/.test(w)));
});

test("near-capacity warning (no oversell)", () => {
  const r = computeCapacity({ capacity: 100, headcount: 95, staffCount: 1 });
  assert.equal(r.oversell, false);
  assert.ok(r.warnings.some((w) => /Near capacity/.test(w)));
});

test("within safe limits → no oversell/near warnings", () => {
  const r = computeCapacity({ capacity: 1000, headcount: 500, staffCount: 5, securityCount: 5 });
  assert.equal(r.oversell, false);
  assert.equal(r.remaining, 500);
  assert.ok(!r.warnings.some((w) => /Oversell|Near capacity/.test(w)));
});

test("nightlife ratios are tighter", () => {
  assert.equal(ratiosFor("nightlife").securityPer, 75);
  assert.equal(ratiosFor("public").staffPer, 100);
});
