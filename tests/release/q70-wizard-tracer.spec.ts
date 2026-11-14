import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseStep, cleanDecimalText, decimalValue } from "../../src/lib/ui/wizard";

// Q70 wizard bug tracer (phase A, code level): pure helpers get real tests; wiring is checked in source. No browser or database.
const src = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test.describe("Q70 · parseStep", () => {
  test("whole steps inside the range pass through", () => {
    expect(parseStep("1", 5)).toBe(1); expect(parseStep("3", 5)).toBe(3); expect(parseStep(" 4 ", 5)).toBe(4);
  });
  test("beyond the last step clamps to the last step", () => { expect(parseStep("9", 5)).toBe(5); expect(parseStep("1e1", 5)).toBe(1); });
  test("fractional, negative, zero, blank, junk and Infinity fall back", () => {
    for (const v of ["2.5", "-1", "0", "", "abc", "Infinity", "NaN", "0x2", undefined, null]) expect(parseStep(v as string, 5)).toBe(1);
  });
  test("fallback is honoured and itself clamped", () => {
    expect(parseStep(undefined, 5, 3)).toBe(3); expect(parseStep("2.5", 5, 9)).toBe(5); expect(parseStep("x", 5, 0)).toBe(1);
  });
  test("array params use the first value", () => { expect(parseStep(["2", "4"], 5)).toBe(2); });
});

test.describe("Q70 · decimal text", () => {
  test("keeps a trailing point and partial decimals while typing", () => {
    expect(cleanDecimalText("12.")).toBe("12."); expect(cleanDecimalText("12.5")).toBe("12.5"); expect(cleanDecimalText(".5")).toBe(".5");
  });
  test("strips symbols, commas and extra points; limits places", () => {
    expect(cleanDecimalText("£1,250.756")).toBe("1250.75"); expect(cleanDecimalText("1.2.3")).toBe("1.23"); expect(cleanDecimalText("abc")).toBe("");
  });
  test("whole-number fields drop the fraction", () => { expect(cleanDecimalText("12.9", 0)).toBe("12"); });
  test("value of the text", () => { expect(decimalValue("")).toBe(0); expect(decimalValue(".")).toBe(0); expect(decimalValue("12.")).toBe(12); expect(decimalValue("0.5")).toBe(0.5); });
});

test.describe("Q70 · ?step= parsing uses parseStep everywhere", () => {
  for (const f of ["src/app/organizer/events/[id]/tickets/setup/page.tsx", "src/app/(customer)/account/events/[id]/tickets/setup/page.tsx", "src/app/organizer/events/[id]/promotion/new/page.tsx",
    "src/app/organizer/marketplace/requests/new/page.tsx", "src/app/organizer/proposals/new/page.tsx", "src/app/provider/bookings/new/page.tsx", "src/app/provider/packages/new/page.tsx",
    "src/app/provider/services/new/page.tsx", "src/app/provider/venues/new/page.tsx", "src/app/provider/venues/[id]/spaces/new/page.tsx"]) {
    test(f, () => { const s = src(f); expect(s).toMatch(/parseStep\(/); expect(s).not.toMatch(/Number\((?:s\()?sp\.step\)?\) \|\|/); });
  }
});

test.describe("Q70 · stepper semantics and focus on step change", () => {
  const client = src("src/components/kit/wizard-client.tsx");
  test("StepFocus targets the step heading or the current stepper item, never on first load", () => {
    expect(client).toMatch(/\[data-step-heading\]/); expect(client).toMatch(/\[aria-current="step"\]/);
    expect(client).toMatch(/const moved = !!lastStep && lastStep\.path === path && lastStep\.step !== now;/);
  });
  for (const f of ["src/components/organizer/wizard.tsx", "src/components/organizer/ticket-pro/ui.tsx", "src/components/organizer/create-event.tsx", "src/components/customer/plan-wizard.tsx",
    "src/components/shared/ticket-setup.tsx", "src/components/onboarding.tsx", "src/components/organizer/promotion-wizard.tsx", "src/components/organizer/template-wizard.tsx",
    "src/components/organizer/invoice-wizard.tsx", "src/app/checkout/[event]/client.tsx", "src/app/provider/opportunities/[id]/quote/page.tsx", "src/app/provider/venues/new/page.tsx",
    "src/app/provider/services/new/page.tsx", "src/app/provider/packages/new/page.tsx", "src/app/provider/venues/[id]/spaces/new/page.tsx", "src/app/provider/bookings/new/page.tsx"]) {
    test(f, () => { const s = src(f); expect(s).toMatch(/<StepFocus step=\{step\} \/>/); expect(/<VSteps /.test(s) ? src("src/components/kit/index.tsx") : s).toMatch(/aria-current=\{[^}]*"step"/); });   // VSteps sets aria-current itself
  }
});

test.describe("Q70 · money inputs accept decimals", () => {
  test("ticket prices, promo amounts, invoice lines and average price use DecimalInput", () => {
    expect(src("src/components/shared/ticket-setup.tsx")).not.toMatch(/value=\{model === "free" \? "0\.00" : t\.price\.toFixed\(2\)\}/);
    expect(src("src/components/organizer/ticket-pro/step-tiers.tsx")).not.toMatch(/value=\{t\.price\.toFixed\(2\)\}/);
    expect(src("src/components/organizer/invoice-wizard.tsx").match(/<DecimalInput/g)?.length).toBe(3);
    expect(src("src/components/organizer/create-event.tsx")).toMatch(/<DecimalInput aria-label="Average ticket price"/);
  });
});

test.describe("Q70 · organiser create event", () => {
  const a = src("src/lib/actions/create-event.ts"), w = src("src/components/organizer/create-event.tsx");
  test("Save setup on a live event never moves it back to planning", () => { expect(a).toMatch(/\.\.\.\(o\.e\.status === "draft" \? \{ status: "planning" \} : \{\}\)/); expect(a).not.toMatch(/update\(\{ status: "planning", \.\.\.\(slug/); });
  test("step 1 client checks match the server (name 2+, client 120)", () => { expect(w).toMatch(/s1\.name\.trim\(\)\.length < 2/); expect(w).toMatch(/list="ce2-clients" maxLength=\{120\}/); });
});

test.describe("Q70 · customer plan create", () => {
  const a = src("src/lib/actions/plan-wizard.ts");
  test("starter tasks are added once and a failed status change is reported", () => {
    expect(a).toMatch(/if \(!count\) \{ const \{ error: taskErr \}/); expect(a).toMatch(/\.eq\("id", e\.id\)\.eq\("status", "draft"\)\.select\("id"\);/);
    expect(a).toMatch(/if \(upErr \|\| !moved\?\.length\) return \{ ok: false/);
  });
});

test.describe("Q70 · invoice wizard", () => {
  test("step 2 needs a saved draft invoice", () => { expect(src("src/app/organizer/money/invoices/new/page.tsx")).toMatch(/const step = sp\.step === "2" && s && s\.status === "draft" && !dup \? 2 : 1;/); });
});

test.describe("Q70 · provider booking", () => {
  test("Cancel asks before discarding the draft", () => { expect(src("src/app/provider/bookings/new/steps.tsx")).toMatch(/confirmDialog\(\{ title: "Discard this booking draft\?"/); });
  test("server validates date/time format and the 100% payment schedule", () => {
    const a = src("src/app/provider/bookings/new/actions.ts");
    expect(a).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(d\.date\)/); expect(a).toMatch(/!== 100\) return \{ ok: false, error: "The payment schedule must add up to 100%\." \}/);
  });
});

test.describe("Q70 · other wizards", () => {
  test("package pricing re-checks the guest range", () => { expect(src("src/app/provider/packages/actions.ts")).toMatch(/if \(gMin !== null && gMax !== null && gMax < gMin\)/); });
  test("onboarding stays busy through navigation", () => { const o = src("src/components/onboarding.tsx"); expect(o).toMatch(/finally \{ if \(!leaving\) setBusy\(false\); \}/); });
  test("customer ticket setup holds pending through navigation", () => { expect(src("src/components/shared/ticket-setup.tsx")).toMatch(/startNav\(\(\) => router\.push\(to === "exit"/); });
  test("promotion wizard survives a refresh (consents excluded)", () => { const p = src("src/components/organizer/promotion-wizard.tsx"); expect(p).toMatch(/gd-promo-draft:/); expect(p).not.toMatch(/JSON\.stringify\(\{[^}]*consent/); });
});

test.describe("Q70 · plan rail on short screens", () => {
  test("the sticky rail stops sticking below 820px tall", () => { expect(src("src/styles/cu-plan-wizard.css")).toMatch(/@media \(min-width: 1001px\) and \(max-height: 820px\) \{ \.pw-rail \{ position: static; \} \}/); });
});
