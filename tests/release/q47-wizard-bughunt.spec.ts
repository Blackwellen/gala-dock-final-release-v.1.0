import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Q47 wizard / create-flow bug hunt (phase A, code level). Source checks only: no browser, no dev server, no database.
const src = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test.describe("Q47 · customer plan wizard", () => {
  const w = src("src/components/customer/plan-wizard.tsx");
  test("a second Continue click reuses the first save's event id and stays busy until the next step renders", () => {
    expect(w).toMatch(/const planId = useRef<string \| null>\(ev\?\.id \?\? null\)/);
    expect(w).toMatch(/savePlanStep\(n, payload, planId\.current\)/);
    expect(w).toMatch(/planId\.current = r\.data\.id; setLeaving\(true\);/);
    expect(w).not.toMatch(/disabled=\{pending \|\| /);
  });
  test("Discard draft asks first", () => {
    expect(w).toMatch(/confirmDialog\(\{ title: "Discard this draft\?"/);
  });
  test("past-date blocking and the suggested date use the UK calendar day, not UTC", () => {
    expect(w).toMatch(/const today = new Date\(\)\.toLocaleDateString\("en-CA", \{ timeZone: "Europe\/London" \}\)/);
    expect(w).not.toMatch(/date: d\.toISOString\(\)\.slice\(0, 10\)/); // "Suggest dates" built the ISO day from a local Date
    expect(src("src/lib/actions/plan-wizard.ts")).toMatch(/d\.date < new Date\(\)\.toLocaleDateString\("en-CA", \{ timeZone: "Europe\/London" \}\)/);
  });
  test("a pasted decimal budget is not multiplied by 100", () => {
    expect(w.match(/Number\(e\.target\.value\.split\("\."\)\[0\]!\.replace\(\/\\D\/g, ""\)\) \|\| 0/g)?.length).toBe(3);
  });
  test("?step= is an integer", () => {
    expect(src("src/app/(customer)/plan/page.tsx")).toMatch(/Math\.trunc\(Number\(sp\.step\)\)/);
  });
});

test.describe("Q47 · customer booking flow", () => {
  const page = src("src/app/(customer)/account/events/[id]/book/page.tsx");
  const flow = src("src/components/customer/booking-flow.tsx");
  test("a cancelled Stripe payment never lands on the 'Request sent' confirmation", () => {
    expect(page).toMatch(/if \(step === 3 && sp\.payment === "cancelled"\) redirect\(`\$\{base\}&step=2&payment=cancelled`\);/);
    expect(page).toMatch(/Payment was cancelled and nothing has been charged/);
  });
  test("step 3 by URL before anything was sent goes back to Requirements", () => {
    expect(page).toMatch(/if \(step === 3 && \["suggested", "draft"\]\.includes\(it\.status\)\) redirect\(`\$\{base\}&step=1`\);/);
  });
  test("back from Checkout before the webhook shows a payment-confirming state, not 'Request sent'", () => {
    expect(page).toMatch(/const processing = !done && \["quoted", "available", "quote_received", "quote_revised", "customer_reviewing"\]\.includes\(it\.status\);/);
    expect(page).toMatch(/processing \? `Confirming your payment to \$\{it\.title\}`/);
  });
  test("Book & pay / Submit stay disabled until the next page or Stripe loads (no second checkout session)", () => {
    expect(flow).toMatch(/const pending = acting \|\| leaving;/);
    expect(flow).toMatch(/\{ setLeaving\(true\); window\.location\.assign\(res\.data\); \}/);
    expect(flow).toMatch(/if \(e\.persisted\) setLeaving\(false\)/);
  });
  test("the date input minimum is the UK calendar day", () => {
    expect(flow).toMatch(/min=\{new Date\(\)\.toLocaleDateString\("en-CA", \{ timeZone: "Europe\/London" \}\)\}/);
  });
});

test.describe("Q47 · auth and onboarding", () => {
  const a = src("src/components/auth.tsx");
  test("Turnstile is re-armed after every sign-up, Google start and passkey attempt that consumed the token", () => {
    expect(a).toMatch(/emailRedirectTo[\s\S]*?\}\);\n\s*\/\/ Turnstile tokens are single-use[^\n]*\n\s*if \(needsCaptcha\) setCaptchaReset\(n => n \+ 1\);/);
    expect(a).toMatch(/onCaptchaUsed=\{\(\) => setCaptchaReset\(n => n \+ 1\)\} \/>/);
    expect(a).toMatch(/if \(captcha && error\) onCaptchaUsed\?\.\(\);/);
    expect(a).toMatch(/<Turnstile onToken=\{setCaptcha\}/); // captcha stays
  });
  test("onboarding header links point at real routes", () => {
    const o = src("src/components/onboarding.tsx");
    expect(o).not.toMatch(/href="\/events\/london"|\/venues\/riverside-arena/);
    expect(o).toMatch(/href="\/events\/in\/london"/);
  });
});

test.describe("Q47 · organiser wizards", () => {
  test("switching event in the promotion wizard resets its state; boost survives step changes", () => {
    expect(src("src/app/organizer/promotions/new/page.tsx")).toMatch(/<PromotionWizard key=\{e\.id\}/);
    expect(src("src/components/organizer/promotion-wizard.tsx")).toMatch(/&boost=\$\{encodeURIComponent\(boost\)\}/);
  });
  test("RFQ date prefilled from the event is the UK day", () => {
    expect(src("src/components/organizer/rfq-wizard.tsx")).not.toMatch(/e\.starts_at\?\.slice\(0, 10\)/);
  });
});
