import { test } from "node:test";
import assert from "node:assert/strict";
import type { RfqRecord } from "@/app/event-manager/suppliers/_data/types";
import {
  computeRfqKpis,
  computeResponseAnalytics,
  computeAwardRate,
  computeCategoryDemand,
} from "@/app/event-manager/suppliers/_data/kpis";

function rfq(overrides: Partial<RfqRecord> = {}): RfqRecord {
  return {
    id: "rfq-1",
    code: "RFQ-2026-001",
    title: "Test RFQ",
    event: { name: "Test Event", date: "2026-08-01", location: "London" },
    category: "Wedding",
    suppliersInvited: 10,
    responses: 0,
    quoteRangeLow: 100000,
    quoteRangeHigh: 200000,
    dueDate: "2026-08-10",
    status: "draft",
    awardedSupplierName: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("computeRfqKpis: active bucket includes sent/responses-received/under-review only", () => {
  const data = [
    rfq({ id: "1", status: "sent" }),
    rfq({ id: "2", status: "responses-received" }),
    rfq({ id: "3", status: "under-review" }),
    rfq({ id: "4", status: "draft" }),
    rfq({ id: "5", status: "awarded" }),
    rfq({ id: "6", status: "closed" }),
  ];
  const kpis = computeRfqKpis(data);
  assert.equal(kpis.total, 6);
  assert.equal(kpis.active, 3);
  assert.equal(kpis.awarded, 1);
});

test("computeRfqKpis: projected value is the midpoint of the quote range, summed", () => {
  const data = [
    rfq({ id: "1", quoteRangeLow: 100000, quoteRangeHigh: 200000 }), // mid 150000
    rfq({ id: "2", quoteRangeLow: 0, quoteRangeHigh: 100000 }), // mid 50000
  ];
  const kpis = computeRfqKpis(data);
  assert.equal(kpis.projectedValue, 200000);
});

test("computeRfqKpis: responsesReceived sums the responses field across all RFQs", () => {
  const data = [rfq({ id: "1", responses: 3 }), rfq({ id: "2", responses: 5 })];
  assert.equal(computeRfqKpis(data).responsesReceived, 8);
});

test("computeResponseAnalytics: draft RFQs count entirely as no-response", () => {
  const data = [rfq({ id: "1", status: "draft", suppliersInvited: 5, responses: 0 })];
  const result = computeResponseAnalytics(data);
  const byLabel = Object.fromEntries(result.map((r) => [r.label, r.value]));
  assert.equal(byLabel["No Response"], 5);
  assert.equal(byLabel["Responded"], 0);
});

test("computeResponseAnalytics: closed RFQs count unresponded invitees as declined", () => {
  const data = [rfq({ id: "1", status: "closed", suppliersInvited: 10, responses: 6 })];
  const result = computeResponseAnalytics(data);
  const byLabel = Object.fromEntries(result.map((r) => [r.label, r.value]));
  assert.equal(byLabel["Responded"], 6);
  assert.equal(byLabel["Declined"], 4);
});

test("computeResponseAnalytics: in-flight RFQs count unresponded invitees as pending", () => {
  const data = [rfq({ id: "1", status: "sent", suppliersInvited: 8, responses: 3 })];
  const result = computeResponseAnalytics(data);
  const byLabel = Object.fromEntries(result.map((r) => [r.label, r.value]));
  assert.equal(byLabel["Responded"], 3);
  assert.equal(byLabel["Pending"], 5);
});

test("computeAwardRate: rate is awarded / (awarded + closed), ignoring in-flight RFQs", () => {
  const data = [
    rfq({ id: "1", status: "awarded" }),
    rfq({ id: "2", status: "awarded" }),
    rfq({ id: "3", status: "closed" }),
    rfq({ id: "4", status: "closed" }),
    rfq({ id: "5", status: "sent" }), // excluded — still in flight
  ];
  const result = computeAwardRate(data);
  assert.equal(result.total, 4);
  assert.equal(result.awarded, 2);
  assert.equal(result.rate, 50);
});

test("computeAwardRate: zero closed/awarded RFQs yields a 0% rate, not NaN/Infinity", () => {
  const result = computeAwardRate([rfq({ id: "1", status: "draft" })]);
  assert.equal(result.rate, 0);
  assert.equal(result.total, 0);
});

test("computeCategoryDemand: sorts by count descending, share percentages sum sensibly", () => {
  const data = [
    rfq({ id: "1", category: "Wedding" }),
    rfq({ id: "2", category: "Wedding" }),
    rfq({ id: "3", category: "Corporate Conference" }),
  ];
  const demand = computeCategoryDemand(data);
  assert.equal(demand[0].label, "Wedding");
  assert.equal(demand[0].value, 2);
  assert.equal(demand[0].sharePct, 67);
});
