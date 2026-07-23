import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  daysFromToday,
  relativePast,
  relativeFuture,
  isOverdue,
  formatGBP,
  formatPct,
} from "@/app/event-manager/suppliers/_data/format";
import { ANCHOR_DATE } from "@/app/event-manager/suppliers/_data/demo-data";

function isoDaysFromAnchor(offset: number): string {
  const d = new Date(ANCHOR_DATE);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

test("formatDate handles null/invalid/valid values", () => {
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate(undefined), "—");
  assert.equal(formatDate("not-a-date"), "—");
  assert.equal(formatDate("2026-01-15T00:00:00.000Z"), "15 Jan 2026");
});

test("daysFromToday is anchored to the fixed demo date, not the system clock", () => {
  assert.equal(daysFromToday(ANCHOR_DATE.toISOString()), 0);
  assert.equal(daysFromToday(isoDaysFromAnchor(5)), 5);
  assert.equal(daysFromToday(isoDaysFromAnchor(-5)), -5);
  assert.equal(daysFromToday(null), null);
  assert.equal(daysFromToday("garbage"), null);
});

test("relativePast buckets days/months/years correctly", () => {
  assert.equal(relativePast(ANCHOR_DATE.toISOString()), "Today");
  assert.equal(relativePast(isoDaysFromAnchor(-1)), "1 day ago");
  assert.equal(relativePast(isoDaysFromAnchor(-10)), "10 days ago");
  assert.equal(relativePast(isoDaysFromAnchor(-60)), "2 months ago");
  assert.equal(relativePast(isoDaysFromAnchor(-400)), "1 years ago");
  assert.equal(relativePast(null), "—");
});

test("relativeFuture distinguishes overdue / due today / future", () => {
  assert.equal(relativeFuture(isoDaysFromAnchor(-3)), "Overdue");
  assert.equal(relativeFuture(ANCHOR_DATE.toISOString()), "Due today");
  assert.equal(relativeFuture(isoDaysFromAnchor(1)), "In 1 day");
  assert.equal(relativeFuture(isoDaysFromAnchor(14)), "In 14 days");
  assert.equal(relativeFuture(null), "—");
});

test("isOverdue is true only for strictly past dates", () => {
  assert.equal(isOverdue(isoDaysFromAnchor(-1)), true);
  assert.equal(isOverdue(ANCHOR_DATE.toISOString()), false);
  assert.equal(isOverdue(isoDaysFromAnchor(1)), false);
  assert.equal(isOverdue(null), false);
});

test("formatGBP formats whole-pound GBP currency", () => {
  assert.equal(formatGBP(1250), "£1,250");
  assert.equal(formatGBP(0), "£0");
});

test("formatPct rounds to a whole percentage", () => {
  assert.equal(formatPct(62.4), "62%");
  assert.equal(formatPct(62.6), "63%");
});
