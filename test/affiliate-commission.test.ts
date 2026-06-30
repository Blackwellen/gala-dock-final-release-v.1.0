import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOverrideCents,
  summariseEarnings,
  combinedEarningsCents,
} from "@/lib/affiliate/commission";

test("override is a floored percentage of the child invoice", () => {
  assert.equal(computeOverrideCents(10000, 5), 500); // £100 @ 5% = £5
  assert.equal(computeOverrideCents(9999, 5), 499); // floors
  assert.equal(computeOverrideCents(10000, 0), 0); // no rate, no override
  assert.equal(computeOverrideCents(0, 5), 0); // no invoice, no override
});

test("earnings summary buckets by status and excludes void", () => {
  const s = summariseEarnings([
    { amountCents: 100, status: "pending" },
    { amountCents: 200, status: "approved" },
    { amountCents: 300, status: "paid" },
    { amountCents: 999, status: "void" },
    { amountCents: 50, status: "unknown" }, // -> pending bucket
  ]);
  assert.equal(s.pendingCents, 150);
  assert.equal(s.approvedCents, 200);
  assert.equal(s.paidCents, 300);
  assert.equal(s.totalCents, 650); // void excluded
});

test("combined lifetime earnings add tier-1 and tier-2", () => {
  const direct = [{ amountCents: 1000, status: "paid" }];
  const override = [
    { amountCents: 500, status: "pending" },
    { amountCents: 200, status: "void" },
  ];
  assert.equal(combinedEarningsCents(direct, override), 1500);
});
