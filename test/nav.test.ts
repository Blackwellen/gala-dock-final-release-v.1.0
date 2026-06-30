import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAppNav, buildAppNavGroups } from "@/lib/nav/app-nav";

const hrefs = (type: Parameters<typeof buildAppNav>[0], flags?: Parameters<typeof buildAppNav>[1]) =>
  buildAppNav(type, flags).map((i) => i.href);

test("organizer nav uses /event-manager prefix and hides flag-gated items by default", () => {
  const h = hrefs("organizer");
  assert.ok(h.includes("/event-manager/events"));
  assert.ok(h.includes("/event-manager/suppliers"));
  assert.ok(!h.includes("/event-manager/calendar")); // calendarHub flag off
  assert.ok(!h.includes("/event-manager/tickets")); // ticketing flag off
});

test("organizer nav drops Venue Ops, top-level RFQs and Proposals (merged/tidied)", () => {
  const h = hrefs("organizer");
  assert.ok(!h.includes("/event-manager/venue-management")); // venue persona only
  assert.ok(!h.includes("/event-manager/rfqs")); // consolidated under Suppliers
  assert.ok(!h.includes("/event-manager/proposals")); // consolidated under Sales (leads)
  assert.ok(h.includes("/event-manager/leads")); // Sales item
});

test("organizer nav shows calendar when the flag is on", () => {
  assert.ok(hrefs("organizer", { calendarHub: true }).includes("/event-manager/calendar"));
});

test("supplier persona shows jobs + rfqs, not events", () => {
  const h = hrefs("supplier");
  assert.ok(h.includes("/event-manager/jobs"));
  assert.ok(h.includes("/event-manager/rfqs"));
  assert.ok(!h.includes("/event-manager/events"));
});

test("venue marketplace link appears only with its flag", () => {
  assert.ok(!hrefs("venue").includes("/event-manager/marketplace/listings"));
  assert.ok(hrefs("venue", { marketplaceVenue: true }).includes("/event-manager/marketplace/listings"));
});

test("nav is grouped with labelled sections for organizer", () => {
  const groups = buildAppNavGroups("organizer");
  const labels = groups.map((g) => g.label).filter(Boolean);
  assert.ok(labels.includes("Delivery"));
  assert.ok(labels.includes("Workspace"));
});
