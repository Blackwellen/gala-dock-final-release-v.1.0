import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { wallToIso, isoToWall, sameMinute } from "../../src/lib/events/wall-time";

// Q48 organiser bug hunt (phase A, code level). Pure + source checks only: no browser, no dev server, no database.
const src = (p: string) => readFileSync(p, "utf8");

test.describe("Q48 · London wall time for datetime-local inputs", () => {
  test("BST: 19:00 London is 18:00Z and round-trips unchanged", () => {
    expect(wallToIso("2026-07-04T19:00")).toBe("2026-07-04T18:00:00.000Z");
    expect(isoToWall("2026-07-04T18:00:00.000Z")).toBe("2026-07-04T19:00");
    // Saving the edit form twice must not drift (it moved +1h per save before).
    expect(wallToIso(isoToWall(wallToIso("2026-07-04T19:00")))).toBe("2026-07-04T18:00:00.000Z");
  });
  test("GMT: wall time equals UTC; DST edges resolve", () => {
    expect(wallToIso("2026-12-01T09:30")).toBe("2026-12-01T09:30:00.000Z");
    expect(isoToWall("2026-12-01T09:30:00.000Z")).toBe("2026-12-01T09:30");
    expect(wallToIso("2026-03-29T00:30")).toBe("2026-03-29T00:30:00.000Z"); // before the 01:00 GMT jump
    expect(wallToIso("2026-03-29T03:00")).toBe("2026-03-29T02:00:00.000Z"); // after it (BST)
  });
  test("instants with an offset pass through; blanks are null", () => {
    expect(wallToIso("2026-07-04T18:00:00.000Z")).toBe("2026-07-04T18:00:00.000Z");
    expect(wallToIso("2026-07-04T19:00:00+01:00")).toBe("2026-07-04T18:00:00.000Z");
    expect(wallToIso("")).toBeNull(); expect(wallToIso(undefined)).toBeNull(); expect(wallToIso("nope")).toBeNull();
    expect(isoToWall(null)).toBe("");
  });
  test("an untouched start (seconds dropped by the input) is not a date change", () => {
    expect(sameMinute("2026-07-04T18:00:30.000Z", wallToIso("2026-07-04T19:00"))).toBe(true);
    expect(sameMinute("2026-07-04T18:00:00.000Z", wallToIso("2026-07-04T20:00"))).toBe(false);
    expect(sameMinute(null, null)).toBe(true);
  });
});

test.describe("Q48 · organiser fixes stay in place (source)", () => {
  test("useAction holds pending through a redirect (no double create/send)", () => {
    const s = src("src/components/kit/client.tsx");
    expect(s).toMatch(/const \[navigating, startNav\] = useTransition\(\); const pending = saving \|\| navigating;/);
    expect(s).toMatch(/startNav\(\(\) => router\.push\(to\)\)/);
  });
  test("create-event and ticket setup steps navigate inside a transition", () => {
    expect(src("src/components/organizer/create-event.tsx")).toMatch(/startNav\(\(\) => router\.push\(/);
    for (const f of ["step-model", "step-tiers", "step-seating", "step-access"]) expect(src(`src/components/organizer/ticket-pro/${f}.tsx`), f).toMatch(/startNav\(\(\) => router\.push\(/);
    expect(src("src/components/organizer/ticket-pro/ui.tsx")).toMatch(/toLocal = \(iso: string \| null\) => isoToWall\(iso\)/);
  });
  test("event edit + programme read datetime-local as London time", () => {
    const s = src("src/lib/actions/event-profile.ts");
    expect(s).toMatch(/wallToIso\(p\.data\.starts_at\), en = wallToIso\(p\.data\.ends_at\)/);
    expect(s).toMatch(/!sameMinute\(s, o\.e\.starts_at\)/);
    expect(s).not.toMatch(/new Date\(p\.data\.starts_at\)\.toISOString\(\)/);
  });
  test("event header: archive asks first; More menu closes after a pick", () => {
    expect(src("src/components/organizer/event/controls.tsx")).toMatch(/setArchive\(true\)/);
    expect(src("src/components/organizer/event/header.tsx")).toMatch(/<details key=\{current\} className="eh-more">/);
  });
  test("RFQ send is single-shot; proposals filter keeps a way back", () => {
    expect(src("src/components/organizer/rfq-wizard.tsx")).toMatch(/disabled=\{pending \|\| sent \|\| !recipients\.length\}/);
    expect(src("src/app/organizer/sales/page.tsx")).toMatch(/No proposals match these filters/);
  });
});

test.describe("Q48 follow-up · headers, dead chrome, leftovers (source)", () => {
  const EV = "src/app/organizer/events/[id]/";
  test("every event sub-page shows the compact event header instead of its own crumbs", () => {
    for (const f of ["map", "media", "page", "promotion", "template", "scan", "live", "virtual"]) {
      const s = src(`${EV}${f}/page.tsx`);
      expect(s, f).toMatch(/<EventSubHeader id=/);
      expect(s, f).not.toMatch(/<Crumbs items=|PageHead crumbs=|om-crumbs/);
    }
    expect(src(`${EV}tickets/setup/page.tsx`)).toMatch(/header=\{header\}/);
    expect(src("src/app/organizer/promotions/new/page.tsx")).toMatch(/<EventSubHeader id=\{e\.id\}/);
    expect(src("src/components/organizer/event/header.tsx")).toMatch(/export function EventSubHeader/);
  });
  test("no per-page inline font sizes on organiser page heads", () => {
    for (const f of ["src/app/organizer/events/page.tsx", "src/app/organizer/page.tsx", "src/app/organizer/calendar/page.tsx", "src/app/organizer/sales/page.tsx", "src/app/organizer/marketplace/page.tsx", "src/components/organizer/wizard.tsx"])
      expect(src(f), f).not.toMatch(/<h1 style=\{\{ fontSize|className="sub" style=\{\{ fontSize/);
  });
  test("dead burger drawer / tab bar removed; Help goes to one place", () => {
    const shell = src("src/components/organizer/shell.tsx"), css = src("src/styles/organizer.css");
    expect(shell).not.toMatch(/o-tabbar|o-burger|o-scrim|o-side-mobile-head|navOpen/);
    expect(css).not.toMatch(/\.o-tabbar|\.o-burger|\.o-scrim|\.o-side-mobile-head/);
    expect(shell).not.toMatch(/"\/organizer\/help"/);
    expect(shell.match(/\/help\?from=organizer/g)?.length).toBe(2);
  });
  test("leftover fixes", () => {
    const inv = src("src/lib/actions/invoice-wizard.ts");
    expect(inv).toMatch(/\$\{sym\}\$\{tot\.toFixed\(2\)\}/);
    expect(inv.indexOf('from("invoice_installments").delete()')).toBeGreaterThan(inv.indexOf("can't be due before the issue date"));
    const ce = src("src/lib/actions/create-event.ts");
    expect(ce).toMatch(/Could not create the starter tasks/); expect(ce).toMatch(/Could not create the first ticket tier/); expect(ce).toMatch(/if \(upErr\)/);
    expect(src(`${EV}map/editor.tsx`)).toMatch(/onElementsChange=\{setLive\}/);
    expect(src("src/components/venue-plan/plan-builder.tsx")).toMatch(/onElementsChange\?\.\(els\)/);
    expect(src("src/components/organizer/mobile-home.tsx")).toMatch(/section=bookings/);
    expect(src("src/app/organizer/marketplace/page.tsx")).toMatch(/section === "bookings"/);
    const act = src(`${EV}map/actions.ts`);
    expect(act).toMatch(/overlay\.length > 2000\) return \{ ok: false/); expect(act).not.toMatch(/slice\(0, 2000\)/);
  });
  test("all organiser datetime-local forms use London wall time", () => {
    const forms = ["event/sections/s2-shared.tsx", "event/sections/campaigns-client.tsx", "event/sections/lost-property-client.tsx", "event/sections/ops-forms-client.tsx", "event/sections/structure-client.tsx", "event/sections/dependencies-client.tsx", "team-client.tsx", "calendar-client.tsx", "event/controls.tsx", "ticket-pro/ui.tsx", "create-event.tsx"];
    for (const f of forms) { const s = src(`src/components/organizer/${f}`); expect(s, f).toMatch(/@\/lib\/events\/wall-time/); expect(s, f).not.toMatch(/getTimezoneOffset/); }
    for (const f of ["src/lib/actions/logistics.ts", "src/lib/actions/calendar.ts", "src/lib/actions/promotion.ts", "src/lib/virtual/actions.ts", "src/lib/actions/event-profile.ts"]) expect(src(f), f).toMatch(/wallToIso\(/);
    expect(src("src/app/organizer/events/[id]/virtual/form.tsx")).toMatch(/isoToWall\(initial\?\.replay_until\)/);
  });
});
