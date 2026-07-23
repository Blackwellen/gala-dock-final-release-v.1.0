import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCents,
  formatCentsCompact,
  proposalBadgeStatus,
  billApprovalBadgeStatus,
  billPaymentBadgeStatus,
  depositBadgeStatus,
  timesheetBadgeStatus,
  ticketOrderBadgeStatus,
  paymentBadgeStatus,
  daysUntil,
  dueLabel,
  addDays,
  sumMatchedCosts,
} from "@/app/event-manager/finance/_lib/finance";

test("formatCents: converts integer pence to a GBP currency string", () => {
  assert.equal(formatCents(684500), "£6,845.00");
  assert.equal(formatCents(0), "£0.00");
  assert.equal(formatCents(99), "£0.99");
});

test("formatCentsCompact: compact £K/£M notation for KPI tiles", () => {
  assert.equal(formatCentsCompact(29260000), "£292.6K");
  assert.equal(formatCentsCompact(128645000), "£1.29M");
  assert.equal(formatCentsCompact(50000), "£500");
  assert.equal(formatCentsCompact(0), "£0");
});

test("formatCentsCompact: handles negative values without losing the sign", () => {
  assert.equal(formatCentsCompact(-26030000), "-£260.3K");
});

test("proposalBadgeStatus: maps every proposal status to a supported StatusBadge status", () => {
  assert.equal(proposalBadgeStatus("draft"), "draft");
  assert.equal(proposalBadgeStatus("sent"), "sent");
  assert.equal(proposalBadgeStatus("viewed"), "viewed");
  assert.equal(proposalBadgeStatus("signed"), "won");
  assert.equal(proposalBadgeStatus("converted"), "converted");
  assert.equal(proposalBadgeStatus("declined"), "lost");
  assert.equal(proposalBadgeStatus("expired"), "expired");
});

test("billApprovalBadgeStatus / billPaymentBadgeStatus: map the split event_expenses columns", () => {
  assert.equal(billApprovalBadgeStatus("pending_review"), "pending-review");
  assert.equal(billApprovalBadgeStatus("approved"), "approved");
  assert.equal(billApprovalBadgeStatus("on_hold"), "on-hold");
  assert.equal(billPaymentBadgeStatus("part_paid"), "part-paid");
  assert.equal(billPaymentBadgeStatus("unpaid"), "unpaid");
  assert.equal(billPaymentBadgeStatus("paid"), "paid");
});

test("depositBadgeStatus / timesheetBadgeStatus / ticketOrderBadgeStatus / paymentBadgeStatus mappers", () => {
  assert.equal(depositBadgeStatus("partial"), "part-paid");
  assert.equal(depositBadgeStatus("withheld"), "forfeited");
  assert.equal(timesheetBadgeStatus("submitted"), "submitted");
  assert.equal(timesheetBadgeStatus("approved"), "approved");
  assert.equal(ticketOrderBadgeStatus("refunded"), "refunded");
  assert.equal(paymentBadgeStatus("succeeded"), "paid");
  assert.equal(paymentBadgeStatus("pending"), "pending");
});

test("daysUntil: positive for future dates, negative for past dates, 0 for today", () => {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const future = new Date(today);
  future.setDate(future.getDate() + 5);
  assert.equal(daysUntil(iso(future)), 5);

  const past = new Date(today);
  past.setDate(past.getDate() - 3);
  assert.equal(daysUntil(iso(past)), -3);

  assert.equal(daysUntil(iso(today)), 0);
  assert.equal(daysUntil(null), null);
});

test("dueLabel: human-readable due-date labels", () => {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  assert.equal(dueLabel(iso(today)), "Today");

  const inThreeDays = new Date(today);
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  assert.equal(dueLabel(iso(inThreeDays)), "In 3 days");

  const oneDayOverdue = new Date(today);
  oneDayOverdue.setDate(oneDayOverdue.getDate() - 1);
  assert.equal(dueLabel(iso(oneDayOverdue)), "1 day overdue");

  assert.equal(dueLabel(null), "—");
});

test("addDays: adds a day offset to an ISO date string", () => {
  const result = addDays("2026-07-01T00:00:00.000Z", 10);
  assert.ok(result !== null);
  assert.equal(new Date(result!).getUTCDate(), 11);
  assert.equal(addDays(null, 10), null);
});

test("sumMatchedCosts: only sums cost for events that also have revenue (regression test for the negative Gross Profit bug)", () => {
  const revenueByEvent = new Map([
    ["event-a", 6845000],
    ["event-b", 4278000],
  ]);
  // event-c has real committed supplier cost but no invoice yet — this cost
  // must NOT be folded into the headline Gross Profit/Margin calculation.
  const costByEvent = new Map([
    ["event-a", 2475000],
    ["event-b", 1584000],
    ["event-c", 55039000],
  ]);

  const matched = sumMatchedCosts(revenueByEvent, costByEvent);
  assert.equal(matched, 2475000 + 1584000);

  const totalRevenue = [...revenueByEvent.values()].reduce((s, v) => s + v, 0);
  const grossProfit = totalRevenue - matched;
  assert.ok(grossProfit > 0, "Gross Profit must stay positive when costs are matched to revenue-having events only");

  // Sanity check: summing ALL costs (the original bug) would have gone negative.
  const allCosts = [...costByEvent.values()].reduce((s, v) => s + v, 0);
  assert.ok(totalRevenue - allCosts < 0, "summing unmatched costs reproduces the original bug for this fixture");
});

test("sumMatchedCosts: returns 0 when there is no revenue at all", () => {
  assert.equal(sumMatchedCosts(new Map(), new Map([["event-a", 1000]])), 0);
});
