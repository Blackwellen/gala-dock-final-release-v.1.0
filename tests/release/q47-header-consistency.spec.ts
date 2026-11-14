import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dateWindow } from "../../src/lib/events/date-window";
import { schemaEventStatus } from "../../src/lib/events/schema-status";

// Q47 header consistency + dead links (phase A, code level). Source checks only: no browser, no dev server, no database.
const src = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test.describe("Q47 · customer header", () => {
  const shell = src("src/components/customer/shell.tsx");
  test("phone/tablet and desktop logos go to the same customer home", () => {
    expect(shell).toMatch(/<MobileNav home="\/home"/);
    expect(shell).toMatch(/<Link href="\/home" className="c-logo"/);
  });
  test("the phone menu lists Account and Help (not titleOnly) and Help goes straight to /help?from=customer", () => {
    expect(shell).toMatch(/\{ href: "\/account", label: "Account", icon: User, exact: true \}/);
    expect(shell).toMatch(/\{ href: "\/help\?from=customer", label: "Help", icon: CircleHelp \}/);
    expect(shell).not.toMatch(/titleOnly: true/);
    expect(shell).not.toMatch(/"\/account\/help"\s*,\s*label/);
  });
  test("no unreachable second mobile menu (burger sheet / bottom tab bar) behind the shared MobileNav", () => {
    expect(shell).not.toMatch(/c-burger|c-sheet|c-tabbar/);
  });
});

test.describe("Q47 · shared MobileNav", () => {
  const nav = src("src/components/pwa/mobile-nav.tsx");
  const css = src("src/styles/pwa-nav.css");
  test("titleOnly entries don't suppress the shared My account / Help links", () => {
    expect(nav).toMatch(/const listed = menu\.filter\(m => !m\.titleOnly\)/);
    expect(nav).toMatch(/!listed\.some\(m => m\.href === "\/account"/);
    expect(nav).toMatch(/!listed\.some\(m => \/\^help\$\/i\.test\(m\.label\)\)/);
  });
  test("uses the shared lockup (G mark only at ≤640px via brand.css) instead of the favicon image", () => {
    expect(nav).toMatch(/className="pwa-mark" aria-label="Gala Dock home"><GalaLogo \/>/);
    expect(nav).not.toMatch(/favicon-48\.png/);
    expect(css).toMatch(/\.pwa-mark \.gd-lockup \{ --gd-h:32px; \}/);
    expect(css).not.toMatch(/\.pwa-mark img \{ width:32px; height:32px; \}/);
    expect(src("src/styles/brand.css")).toMatch(/@media\(max-width:640px\)\{\.gd-lockup:not\(\.gd-keep-word\)>img\.gd-lockup-word\{display:none\}/);
  });
});

test.describe("Q47 · public header", () => {
  test("customer.css's workspace logo margin doesn't change the public header on /events, /help and legal pages", () => {
    expect(src("src/styles/public-site.css")).toMatch(/\.gp-header \.c-logo \{ margin-right: 0; \}/);
  });
});

test.describe("Q47 · dead links", () => {
  test("booking flow's Manage payment methods goes to the real account payments tab", () => {
    const b = src("src/components/customer/booking-flow.tsx");
    expect(b).not.toMatch(/\/account\/settings/);
    expect(b).toMatch(/href="\/account\?tab=payments"/);
  });
});

// ── Q47 follow-up: the ten found-but-not-fixed items ─────────────────────────────────────────────────────────────────────

test.describe("Q47 · follow-up fixes", () => {
  test("cancelled / void tickets leave Upcoming and never read 'Ready to attend'", () => {
    const t = src("src/lib/data/customer-tickets.ts");
    expect(t).toMatch(/\["transferred", "resold", "refunded", "cancelled", "void"\]\.includes\(t\.status\)/);
    expect(t).toMatch(/return \{ label: "Cancelled", tone: "gray" \}/);
  });
  test("Discover date windows are UK time; the weekend runs Friday 17:00 → Sunday night", () => {
    // Tuesday 4 Aug 2026 10:00 BST → Fri 7 Aug 17:00 BST (16:00Z) to Sun 9 Aug 23:59:59.999 BST (22:59:59.999Z).
    const tue = dateWindow("weekend", new Date("2026-08-04T09:00:00Z"))!;
    expect(tue.from!.toISOString()).toBe("2026-08-07T16:00:00.000Z");
    expect(tue.to.toISOString()).toBe("2026-08-09T22:59:59.999Z");
    // Saturday: already in the weekend, no lower bound beyond "not ended".
    const sat = dateWindow("weekend", new Date("2026-08-08T12:00:00Z"))!;
    expect(sat.from).toBeNull(); expect(sat.to.toISOString()).toBe("2026-08-09T22:59:59.999Z");
    // Sunday 23:30 BST is still that weekend (UTC says Sunday 22:30, London says Sunday).
    expect(dateWindow("weekend", new Date("2026-08-09T22:30:00Z"))!.to.toISOString()).toBe("2026-08-09T22:59:59.999Z");
    // Tonight at 00:30 BST (23:30Z the day before) ends at the end of the London day, not the UTC one.
    expect(dateWindow("tonight", new Date("2026-08-04T23:30:00Z"))!.to.toISOString()).toBe("2026-08-05T22:59:59.999Z");
    // Winter (GMT).
    expect(dateWindow("tonight", new Date("2026-12-01T12:00:00Z"))!.to.toISOString()).toBe("2026-12-01T23:59:59.999Z");
    expect(dateWindow("nope")).toBeNull();
    const d = src("src/lib/data/customer.ts");
    expect(d).not.toMatch(/setHours|getDay\(\)/);
    expect(d).toMatch(/if \(win\.from\) q = q\.gte\("ends_at", win\.from\.toISOString\(\)\)/);
  });
  test("onboarding Save & exit validates and saves the step through /api/onboarding, then leaves", () => {
    const api = src("src/app/api/onboarding/route.ts");
    expect(api).toMatch(/if \(body\.action === "exit"\) return json\(\{ workspaceId, saved: true, next: "\/discover" \}\);/);
    expect(api.indexOf('body.action === "exit"')).toBeGreaterThan(api.indexOf("isConnectCountrySupported(country)")); // country gate still runs first
    const o = src("src/components/onboarding.tsx");
    expect(o).toMatch(/onClick=\{\(\) => void post\("exit"\)\}>Save &amp; exit/);
    expect(o).not.toMatch(/<Link href="\/discover">Save &amp; exit/);
  });
  test("Discover's default area is a suggestion: city= only once the visitor picks an area", () => {
    const c = src("src/components/customer/discover-client.tsx");
    expect(c).toMatch(/const \[areaPicked, setAreaPicked\] = useState\(params\.has\("city"\)\)/);
    expect(c).toMatch(/if \(areaPicked\) \{/);
  });
  test("My Events Upcoming count matches its list (drafts included in both)", () => {
    const p = src("src/app/(customer)/account/events/page.tsx");
    expect(p).toMatch(/\["upcoming", "Upcoming", upcoming\.length \+ drafts\.length/);
    expect(p).toMatch(/tab === "upcoming" \? \[\.\.\.upcoming, \.\.\.drafts\]/);
  });
  test("SaveHeart follows its saved prop and ignores a second tap mid-request", () => {
    const k = src("src/components/kit/client.tsx");
    expect(k).toMatch(/if \(prop\.itemKey !== itemKey \|\| prop\.initial !== initial\) \{ setProp\(\{ itemKey, initial \}\); setSaved\(initial\); \}/);
    expect(k).toMatch(/if \(busy\.current\) return; busy\.current = true;/);
  });
  test("build rows reorder on touch (pointer events) and with ↑/↓ buttons", () => {
    const b = src("src/components/customer/build-sortable.tsx");
    expect(b).toMatch(/if \(e\.pointerType === "mouse"\) \{ setArmed\(ix\); return; \}/);
    expect(b).toMatch(/setPointerCapture/);
    expect(b).toMatch(/onPointerCancel=/);
    expect(b).toMatch(/aria-label=\{`Move \$\{labels\[ix\]\} up`\}/);
    expect(b).toMatch(/aria-label=\{`Move \$\{labels\[ix\]\} down`\}/);
    expect(src("src/styles/cu-build.css")).toMatch(/button\.cb-grip \{ touch-action: none; \}/);
  });
  test("Share Event reuses the browser's still-active guest link instead of minting one per tap", () => {
    const a = src("src/lib/actions/event-guest-links.ts");
    expect(a).toMatch(/export async function shareGuestLink\(eventId: string, reuse\?: string \| null\)/);
    expect(a).toMatch(/\.eq\("token_hash", hashToken\(reuse\)\)/);
    expect(a).toMatch(/\.is\("revoked_at", null\)\.gt\("expires_at"/);
    const c = src("src/components/customer/build-client.tsx");
    expect(c).toMatch(/shareGuestLink\(id, prev\)/);
    expect(c).not.toMatch(/createGuestLink\(id\)/);
  });
  test("the event header's ⋯ Cancel opens the real cancel dialog", () => {
    const c = src("src/components/customer/build-client.tsx");
    expect(c).not.toMatch(/Cancel from My Events/);
    expect(c).toMatch(/void cancelDlg\.open\(\)/);
    expect(src("src/components/customer/events-client.tsx")).toMatch(/export function useCancelEventDialog/);
    expect(src("src/components/customer/event-header.tsx")).toMatch(/<HeaderMenu id=\{e\.id\} name=\{e\.name\} status=\{e\.status\} \/>/);
  });
  test("guest list: Select all / row checkboxes drive bulk actions; dead 'More filters' removed", () => {
    const p = src("src/app/(customer)/account/events/[id]/guests-tickets/page.tsx");
    expect(p).not.toMatch(/More filters/);
    expect(p).toMatch(/<GuestSelection eventId=\{e\.id\}>/);
    expect(p).toMatch(/data-guest-all/);
    expect(p).toMatch(/data-guest value=\{g\.id\}/);
    const g = src("src/components/customer/guests-client.tsx");
    expect(g).toMatch(/sendInvites\(eventId, ids\)/);
    expect(g).toMatch(/setGuestsStatus\(eventId, ids, "confirmed"\)/);
    expect(src("src/lib/actions/guests.ts")).toMatch(/export async function setGuestsStatus/);
  });
  test("JSON-LD eventStatus follows the event status", () => {
    expect(schemaEventStatus("cancelled").eventStatus).toBe("https://schema.org/EventCancelled");
    expect(schemaEventStatus("postponed").eventStatus).toBe("https://schema.org/EventPostponed");
    expect(schemaEventStatus("on_sale", { previous_starts_at: "2026-06-01T18:00:00Z" })).toEqual({ eventStatus: "https://schema.org/EventRescheduled", previousStartDate: "2026-06-01T18:00:00Z" });
    expect(schemaEventStatus("on_sale", {}).eventStatus).toBe("https://schema.org/EventScheduled");
    expect(src("src/app/events/[slug]/page.tsx")).not.toMatch(/eventStatus: "https:\/\/schema\.org\/EventScheduled"/);
  });
});
