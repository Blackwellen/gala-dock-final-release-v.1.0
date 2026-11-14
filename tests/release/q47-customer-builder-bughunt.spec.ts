import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseCsv, guestRowsFromCsv } from "../../src/lib/guests/csv";
import { wallToIso, isoToWall } from "../../src/lib/events/wall-time";

// Q47 bug hunt, customer event builder lane (phase A, code level). Pure + source checks only: no browser, no dev server, no database.
const src = (p: string) => readFileSync(p, "utf8");
const EV = "src/app/(customer)/account/events/[id]";

test.describe("Q47 · guest CSV import", () => {
  test("Excel BOM header, quoted commas, doubled quotes, CRLF and blank lines", () => {
    const csv = "﻿Name,Email,Plus One,Group Name\r\n\"Smith, Jane\",jane@example.com,Yes,Family\r\n\r\n\"Bob \"\"B\"\" Lee\",,no,\"Work\nteam\"\r\n";
    expect(parseCsv(csv)).toEqual([["Name", "Email", "Plus One", "Group Name"], ["Smith, Jane", "jane@example.com", "Yes", "Family"], ['Bob "B" Lee', "", "no", "Work\nteam"]]);
    const rows = guestRowsFromCsv(csv);
    expect(rows[0]).toEqual({ name: "Smith, Jane", email: "jane@example.com", plus_one: true, group_name: "Family" });
    expect(rows[1]!.plus_one).toBe(false);
    // "no1" / "nothing" were read as plus-ones by the old /^y|true|1/ test.
    expect(guestRowsFromCsv("name,plus_one\nA,no1\nB,nothing\nC,TRUE")[0]!.plus_one).toBe(false);
    expect(guestRowsFromCsv("name,plus_one\nA,no1\nB,nothing\nC,TRUE")[2]!.plus_one).toBe(true);
  });
  test("the import dialog uses the parser and resets the file input", () => {
    const s = src("src/components/customer/guests-client.tsx");
    expect(s).toContain("guestRowsFromCsv(");
    expect(s).not.toContain('l.split(",")');
    expect(s).toContain('input.value = ""');
  });
});

test.describe("Q47 · plan tab", () => {
  test("checklist ticks use the customer action, not the workspace-only organiser toggleTask", () => {
    const page = src(`${EV}/plan/page.tsx`);
    expect(page).not.toContain("organizer/event/controls");
    expect(page).toContain("<CustomerTaskCheck ");
    expect(src("src/components/customer/plan-client.tsx")).toContain("toggleCustomerTask(");
    expect(src("src/lib/actions/plan.ts")).toMatch(/export async function toggleCustomerTask[\s\S]*\.eq\("event_id", o\.e\.id\)/);
  });
  test("day-plan times are London wall time on the event's London date", () => {
    const s = src("src/lib/actions/plan.ts");
    expect(s).not.toContain("new Date(`${day}T${p.data.time}:00`)");
    expect(s).toContain("wallToIso(`${isoToWall(o.e.starts_at).slice(0, 10)}T${p.data.time}`)");
    // BST event at 19:00 London: a 14:00 item is 13:00Z (was stored 14:00Z and shown at 3pm).
    const start = "2026-07-04T18:00:00+00:00";
    expect(wallToIso(`${isoToWall(start).slice(0, 10)}T14:00`)).toBe("2026-07-04T13:00:00.000Z");
    // 00:30 London on 5 July is 23:30Z on the 4th: the item belongs to 5 July.
    expect(wallToIso(`${isoToWall("2026-07-04T23:30:00Z").slice(0, 10)}T10:00`)).toBe("2026-07-05T09:00:00.000Z");
  });
});

test.describe("Q47 · money, guests & tickets, cancel", () => {
  test("Make a payment opens that booking's payment page (the book page ignored ?pay=)", () => {
    const s = src(`${EV}/money/page.tsx`);
    expect(s).not.toContain("book?step=2&pay=");
    expect(s).toContain("nextGroup.find(p => p.build_item_id)?.build_item_id");
    expect(s).toContain("/bookings/${payItem}");
  });
  test("tier status chips: draft/scheduled/paused/ended are not 'On sale'", () => {
    const s = src(`${EV}/guests-tickets/page.tsx`);
    expect(s).toContain('t.status === "scheduled" ? ["Scheduled"');
    expect(s).toContain('["Sales ended", "gray"]');
    expect(s).toContain('t.status !== "on_sale"');
  });
  test("ticket tier prices accept pence", () => {
    expect(src("src/components/customer/guests-client.tsx")).toContain('name="price" type="number" min={0} max={10000} step={0.01}');
  });
  test("cancel dialog shows an error and retry when the impact check fails", () => {
    const s = src("src/components/customer/events-client.tsx");
    expect(s).toContain("setImpactErr(");
    expect(s).toContain("Try again");
  });
  test("conversation times render in a fixed zone (no hydration mismatch)", () => {
    expect(src("src/components/customer/guests-client.tsx")).toContain('hour12: true, timeZone: "Europe/London" }).toUpperCase()');
  });
});

test.describe("Q47 · build canvas", () => {
  test("provider finder treats every finished line as not in the build (same set as addToBuild)", () => {
    const s = src("src/lib/actions/provider-search.ts");
    for (const st of ["cancelled_by_customer", "refunded", "fulfilled", "expired_no_response", "disputed"]) expect(s).toContain(st);
  });
  test("Share Event shows the link when Safari refuses share/clipboard after the server call", () => {
    expect(src("src/components/customer/build-client.tsx")).toMatch(/name !== "AbortError"\) toast\(`Your private guest link: \$\{url\}`\)/);
  });
  test("CSV export does not revoke the blob URL in the same tick", () => {
    const s = src("src/components/customer/build-menu.tsx");
    expect(s).not.toContain("a.click(); URL.revokeObjectURL(a.href);");
    expect(s).toContain("setTimeout(() => URL.revokeObjectURL(href)");
  });
});
