import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProfitability, scenarioProjections, projectRevenueByCapacity } from "@/lib/events/profitability";
import { budgetCategoriesFor, revenueCategoriesFor, riskItemsFor, layoutModeFor } from "@/lib/events/event-types";

test("profitability: revenue, cost, margin, break-even", () => {
  const p = computeProfitability({
    budget: [{ category: "Venue hire", amountCents: 200000 }, { category: "Staff", amountCents: 100000, confirmed: true }],
    revenue: [{ category: "Ticket sales", amountCents: 500000, confirmed: true }],
    avgTicketPriceCents: 2500,
  });
  assert.equal(p.estRevenueCents, 500000);
  assert.equal(p.estCostCents, 300000);
  assert.equal(p.profitBeforeSplitCents, 200000);
  assert.equal(p.confirmedCostCents, 100000);
  assert.equal(p.breakEvenRevenueCents, 300000);
  assert.equal(p.breakEvenTickets, 120); // 300000 / 2500
  assert.ok(Math.abs(p.marginPct - 0.4) < 1e-9);
});

test("profitability: splits reduce profit, never negative payouts", () => {
  const p = computeProfitability({
    budget: [{ category: "c", amountCents: 100000 }],
    revenue: [{ category: "r", amountCents: 300000 }],
    splits: [{ name: "Venue", pct: 25 }, { name: "Promoter", fixedCents: 20000 }],
  });
  // profit before split = 200000; venue 25% = 50000; promoter fixed 20000
  assert.equal(p.splitPayouts.find((s) => s.name === "Venue")?.amountCents, 50000);
  assert.equal(p.splitPayouts.find((s) => s.name === "Promoter")?.amountCents, 20000);
  assert.equal(p.profitAfterSplitCents, 130000);
});

test("loss: split percentages contribute 0 when profit is negative", () => {
  const p = computeProfitability({ budget: [{ category: "c", amountCents: 500000 }], revenue: [{ category: "r", amountCents: 100000 }], splits: [{ name: "X", pct: 50 }] });
  assert.equal(p.profitBeforeSplitCents, -400000);
  assert.equal(p.splitPayouts[0].amountCents, 0);
});

test("scenario projections scale with sell-through", () => {
  const s = scenarioProjections(2500, 1000);
  assert.equal(s.find((x) => x.name === "expected")?.ticketsSold, 750);
  assert.equal(projectRevenueByCapacity(2500, 1000, 0.75), 1875000);
});

test("event-type config returns category sets + layout mode", () => {
  assert.ok(budgetCategoriesFor("nightlife").includes("Bar deposit"));
  assert.ok(revenueCategoriesFor("public").includes("Sponsorship"));
  assert.ok(riskItemsFor("remote").some((r) => /streaming/i.test(r)));
  assert.equal(layoutModeFor("theatre"), "seated");
  assert.equal(layoutModeFor("festival"), "capacity");
  assert.equal(layoutModeFor("nightclub"), "hybrid");
});
