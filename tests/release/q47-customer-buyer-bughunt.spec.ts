import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Q47 bug hunt, customer buyer journey (discover → event page → checkout → tickets/QR → messages → reviews/account).
// Source assertions only: no browser, no dev server. Each test names the customer symptom it guards against.
const src = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test.describe("Q47 customer buyer bug hunt", () => {
  test("wallet QR: a failed credential request is retried, not shown as 'can't be used for entry'", () => {
    for (const f of ["src/components/tickets/rotating-qr.tsx", "src/components/tickets/ticket-credential.tsx"]) {
      const s = src(f);
      expect(s, f).toMatch(/if \(!r\.ok\) throw new Error\(`credential_\$\{r\.status\}`\);/);
      expect(s.indexOf("if (!r.ok) throw"), f).toBeLessThan(s.indexOf("await r.json()"));
    }
    // "Not valid for entry — valid" came from printing the page-load status instead of the server's.
    expect(src("src/components/tickets/ticket-credential.tsx")).not.toMatch(/ticket\.status\.replace/);
  });

  test("offline scanner: a rotated code for the same ticket is a duplicate, and a refused sync keeps the queue", () => {
    const s = src("src/components/tickets/scanner.tsx");
    expect(s).toMatch(/find\(q\.payload\)\?\.ticket_id === row\.ticket_id/);
    expect(s).not.toMatch(/persistQueue\(\[\]\);/);
    expect(s).toMatch(/if \(fatal && !fatal\.ok\) \{ setReport\(/);
    expect(s).toMatch(/\.\.\.queue\.slice\(500\)/);
  });

  test("discover: the search bar's date (?on=) filters events; home's weekend shortcut uses a param Discover reads", () => {
    const d = src("src/app/(customer)/discover/page.tsx");
    expect(src("src/components/customer/discover-client.tsx")).toMatch(/p\.set\("on", date\)/);
    expect(d).toMatch(/s\(sp\.on\)/);
    expect(d).toMatch(/\.filter\(e => !on \|\|/);
    const h = src("src/app/(customer)/home/page.tsx");
    expect(h).not.toMatch(/when=weekend/);
    expect(h).toMatch(/\/discover\?tab=events&results=1&date=weekend/);
  });

  test("reviews: every status submit_review accepts is listed, and editing keeps existing photos", () => {
    const p = src("src/app/(customer)/account/reviews/page.tsx");
    for (const st of ["confirmed", "active", "fulfilled", "completion_pending", "completed"]) expect(p).toContain(`"${st}"`);
    expect(p).toMatch(/\.in\("status", REVIEWABLE\)/);
    expect(p).toMatch(/photos: \(\(editing\.photos/);
    expect(src("src/components/customer/reviews-client.tsx")).toMatch(/useState<\{ path: string; url: string \| null \}\[\]>\(\(\) => \(initial\?\.photos/);
  });

  test("messages: per-thread state resets when switching, UK times, read state refreshes", () => {
    const i = src("src/components/messaging/inbox.tsx");
    expect(i).toMatch(/<Composer key=\{conv\.id\}/);
    expect(i).toMatch(/<ProfileButton key=/);
    expect(i).toMatch(/timeZone: TZ/);
    expect(src("src/components/messaging/messaging-client.tsx")).toMatch(/void markRead\(conversationId\)\.then\(\(\) => router\.refresh\(\)/);
  });

  test("event page and checkout: slug-less events link to a real checkout, one payment request at a time, pending orders re-check", () => {
    expect(src("src/app/events/[slug]/page.tsx")).toMatch(/<TicketPicker slug=\{slugOrId\}/);
    const c = src("src/app/checkout/[event]/client.tsx");
    expect(c).toMatch(/if \(payLock\.current\) return;/);
    expect(c).toMatch(/\.catch\(\(\) => null\);\n/);
    const conf = src("src/app/checkout/[event]/confirmation/page.tsx");
    expect(conf).toMatch(/<ConfirmAutoRefresh \/>/);
    expect(src("src/components/customer/public-event-client.tsx")).not.toMatch(/£\$\{x\.price\.toLocaleString/);
  });

  test("account: notification toggle rolls back on failure, delete anchor exists, no invented photo counts", () => {
    const a = src("src/components/customer/account-client.tsx");
    expect(a).toMatch(/if \(!r\.ok\) setV\(p => \(\{ \.\.\.p, \[k\]: !val \}\)\)/);
    expect(a).toMatch(/<section id="delete"/);
    expect(src("src/app/(customer)/account/events/page.tsx")).not.toMatch(/\? 9 : 0/);
    expect(src("src/components/customer/public-listing.tsx")).toMatch(/kind=\{kind\} \/>/);
  });
});
