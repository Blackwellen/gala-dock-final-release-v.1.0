import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { londonMonthRange, londonMonthKey, londonDateKey, londonMonthLabel } from "../../src/lib/provider/london-month";
import { csvCell } from "../../src/lib/provider/csv";
import { sellerBookingMode, enquiryOnlyCountry } from "../../src/lib/provider/seller-country";
import { wallToIso } from "../../src/lib/events/wall-time";
import { CONNECT_COPY } from "../../src/lib/payments/connect-countries";

// Q49 provider (venue operator / supplier) bug hunt, phase A (code level). Pure + source checks only: no browser, dev server or DB.
const src = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, ""); // comments stripped

test.describe("Q49 · London months on Money statements", () => {
  test("a BST month starts at 23:00Z the day before; GMT months at midnight", () => {
    expect(londonMonthRange("2026-07").map(t => new Date(t).toISOString())).toEqual(["2026-06-30T23:00:00.000Z", "2026-07-31T23:00:00.000Z"]);
    expect(londonMonthRange("2026-12").map(t => new Date(t).toISOString())).toEqual(["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]);
    expect(londonMonthRange("2026-10").map(t => new Date(t).toISOString())).toEqual(["2026-09-30T23:00:00.000Z", "2026-11-01T00:00:00.000Z"]); // clocks go back inside
  });
  test("a 00:30 BST payment on 1 July is July (it was June in UTC)", () => {
    expect(londonMonthKey("2026-06-30T23:30:00.000Z")).toBe("2026-07");
    expect(londonDateKey("2026-06-30T23:30:00.000Z")).toBe("2026-07-01");
    expect(londonMonthKey("2026-12-31T23:30:00.000Z")).toBe("2026-12");
    expect(londonMonthLabel("2026-07")).toBe("July 2026");
  });
  test("statement, Money page and export use the London helpers", () => {
    expect(src("src/app/provider/money/statement/page.tsx")).toMatch(/londonMonthRange\(m\)/);
    expect(src("src/app/provider/money/statement/page.tsx")).not.toMatch(/T00:00:00Z/);
    expect(src("src/app/provider/money/page.tsx")).toMatch(/londonMonthKey\(t\.occurred_at\)/);
    expect(src("src/app/provider/money/export/route.ts")).toMatch(/londonDateKey\(t\.occurred_at\)/);
  });
});

test.describe("Q49 · CSV exports neutralise formulas", () => {
  test("formula-leading text is prefixed; numbers and plain text are untouched", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+44 20 7946 0000")).toBe("'+44 20 7946 0000");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("Smith, Jane")).toBe("\"Smith, Jane\"");
    expect(csvCell(null)).toBe("");
  });
  test("bookings export uses the safe cell (it quoted only)", () => {
    expect(src("src/app/provider/bookings/export/route.ts")).toMatch(/import \{ csvCell as csv \} from "@\/lib\/provider\/csv"/);
  });
});

test.describe("Q49 · connect-country rule in the provider wizards", () => {
  test("unsupported business country → enquiry-only with the listing copy; supported/unknown untouched", () => {
    expect(enquiryOnlyCountry({ business: { country: "ZA" } })).toBe("South Africa");
    expect(sellerBookingMode({ business: { country: "ZA" } }, "instant")).toEqual({ mode: "enquiry", note: CONNECT_COPY.listingFallback });
    expect(sellerBookingMode({ business: { country: "South Africa" } }, "request").mode).toBe("enquiry");
    expect(sellerBookingMode({ business: { country: "ZA" } }, "enquiry")).toEqual({ mode: "enquiry", note: null });
    expect(sellerBookingMode({ business: { country: "GB" } }, "instant")).toEqual({ mode: "instant", note: null });
    expect(sellerBookingMode({}, "instant")).toEqual({ mode: "instant", note: null });
  });
  test("venue, service and package steps + the venue Commercial tab apply it", () => {
    for (const f of ["src/app/provider/venues/new/actions.ts", "src/app/provider/services/actions.ts", "src/app/provider/packages/actions.ts", "src/app/provider/venues/[id]/actions.ts"])
      expect(src(f), f).toMatch(/sellerBookingMode\(workspace\.settings,/);
    for (const f of ["src/app/provider/venues/new/steps.tsx", "src/app/provider/services/new/steps.tsx", "src/app/provider/packages/new/steps.tsx"])
      expect(src(f), f).toMatch(/disabled=\{!!enquiryOnly && k !== "enquiry"\}/);
  });
});

test.describe("Q49 · double submits (pending through redirects)", () => {
  test("workspace ActionForm/ActionButton refuse re-entry and keep pending while navigating", () => {
    const s = src("src/components/workspace/actions.tsx");
    expect(s.match(/const \[navigating, startNav\] = useTransition\(\); const pending = running \|\| navigating; const busy = useRef\(false\);/g)?.length).toBe(2);
    expect(s.match(/if \(busy\.current \|\| pending\) return;/g)?.length).toBe(2);
    expect(s.match(/startNav\(\(\) => router\.push\(to\)\)/g)?.length).toBe(2);
    expect(src("src/styles/workspace.css")).toMatch(/form\[data-pending\]/);
  });
  test("quote builder/review, booking wizard and Add Space navigate inside a transition", () => {
    for (const f of ["src/app/provider/opportunities/[id]/quote/builder.tsx", "src/app/provider/opportunities/[id]/quote/review.tsx", "src/app/provider/bookings/new/steps.tsx", "src/app/provider/venues/_components/space-basics.tsx"])
      expect(src(f), f).toMatch(/startNav\(\(\) => router\.push\(to\)\)/);
    expect(src("src/app/provider/venues/_components/space-basics.tsx")).toMatch(/setF\(x => \(\{ \.\.\.x, id \}\)\)/);
  });
});

test.describe("Q49 · London wall time for availability blocks", () => {
  test("the dialog and the action read datetime-local as London time", () => {
    expect(wallToIso("2026-07-04T09:00")).toBe("2026-07-04T08:00:00.000Z");
    expect(src("src/app/provider/calendar/availability-dialog.tsx")).toMatch(/wallToIso\(String\(f\.get\(k\)/);
    const a = src("src/app/provider/calendar/actions.ts");
    expect(a).toMatch(/const s = wallToIso\(start\), e = wallToIso\(end\);/);
    expect(a).not.toMatch(/new Date\(local\)/);
    expect(a).toMatch(/revalidatePath\("\/provider\/calendar"\)/);
  });
});

test.describe("Q49 · roles: team export, Money, Create menu", () => {
  test("/api/export/team is owner/manager only and audited", () => {
    const s = src("src/app/api/export/[kind]/route.ts");
    expect(s).toMatch(/team: \{ table: "crew_members", cols: "[^"]+", roles: \["owner", "manager"\], audit: true \}/);
    expect(s).toMatch(/from\("workspace_members"\)\.select\("role"\)\.eq\("workspace_id", workspaceId\)\.eq\("user_id", user\.id\)\.eq\("status", "active"\)/);
    expect(s).toMatch(/status: 403/);
    expect(s).toMatch(/writeAudit\(user\.id, workspaceId, `export\.\$\{kind\}`/);
    expect("export.team").toMatch(/^[a-z_]+(\.[a-z_]+)+$/); // audit_events_event_check
  });
  test("Money page, statement and export are finance-only; desktop nav/Create match mobile", () => {
    expect(src("src/app/provider/money/page.tsx")).toMatch(/if \(!ctx\.can\.finance\) return <FinanceOnly \/>;/);
    expect(src("src/app/provider/money/statement/page.tsx")).toMatch(/if \(!ctx\.can\.finance\) return <FinanceOnly \/>;/);
    expect(src("src/app/provider/money/export/route.ts")).toMatch(/if \(!ctx\.can\.finance\) return NextResponse\.json/);
    const sh = src("src/components/workspace/shell.tsx");
    expect(sh).toMatch(/const sideNav = nav\.filter\(n => n\.label !== "Money" \|\| canFinance\);/);
    expect(sh).toMatch(/<NavList items=\{sideNav\}/);
    expect(sh).toMatch(/createMenu\.map\(c => <Link/);
    expect(sh).not.toMatch(/\{create\.map\(c => <Link/);
  });
  test("Add Space has the same manager gate as the other wizards", () => {
    expect(src("src/app/provider/venues/[id]/spaces/new/page.tsx")).toMatch(/if \(!\(await getProvider\(\)\)\.can\.manage\) return <ManagerOnly title="Add Space"/);
  });
});

test.describe("Q49 · dead links and wrong destinations", () => {
  test("photo links open photo editors, not the venue Identity step", () => {
    const v = src("src/app/provider/venues/[id]/page.tsx");
    expect(v).toMatch(/className="pv-addphotos"/);
    expect(v).not.toMatch(/step=1`\} className="pv-addphotos"/);
    expect(v).toMatch(/label: "Photos", href: `\/provider\/venues\/new\?venue=\$\{v\.id\}&step=5`/);
    const s = src("src/app/provider/venues/[id]/spaces/[spaceId]/page.tsx");
    expect(s).toMatch(/"photos"\] as const/);
    expect(s).toMatch(/saveSpacePhotos\.bind\(null, id, s\.id\)/);
    expect(s).not.toMatch(/venues\/new\?venue=\$\{id\}&step=1/);
  });
  test("booking-rules link, My shifts entry and notification workspace switch", () => {
    expect(src("src/app/provider/opportunities/page.tsx")).not.toMatch(/tab=booking-rules/);
    expect(src("src/app/provider/team/page.tsx")).toMatch(/href=\{`\$\{base\}\/my-shifts`\}/);
    const n = src("src/app/provider/notifications/[id]/route.ts");
    expect(n).toMatch(/access\.find\(w => w\.id === prof\?\.last_workspace_id\)/);
  });
  test("venue Commercial tab keeps the wizard's pricing model", () => {
    const a = src("src/app/provider/venues/[id]/actions.ts");
    expect(a).not.toMatch(/pricing: "hourly", rate_from/);
    expect(a).toMatch(/deposit_mode: "percent", deposit_pct: deposit, deposit_fixed: null/);
  });
  test("plan box reads the plan catalogue", () => {
    const s = code("src/app/provider/settings/page.tsx");
    expect(s).not.toMatch(/Gala Agent \(standard\)/);
    expect(s).toMatch(/pricing\.plans\.find\(x => x\.kind === "provider" && x\.plan === planKey\)/);
  });
});

test.describe("Q49 · header consistency", () => {
  test("one h1 scale and back-link style for provider page heads", () => {
    const css = src("src/styles/provider.css");
    expect(css).toMatch(/\.ws-app\.provider :is\(\.ws-page-head, \.ph-head, \.pv-title, \.pk-title, \.pq-title, \.qp-head, \.qw-head, \.wz-head, \.pmsg-head/);
    expect(css).toMatch(/font-size: 32px;/);
    expect(src("src/components/workspace/kit.tsx")).toMatch(/<ArrowLeft aria-hidden="true" \/>\{back\.label\.toLowerCase\(\)\.startsWith\("back "\)/);
  });
  test("no cross-page class collisions: messages/search and Add Space renamed", () => {
    const misc = code("src/styles/provider-misc.css");
    expect(misc).not.toMatch(/(^|[\s,}])\.pm[\s,{-]/m);
    expect(misc).not.toMatch(/(^|[\s,}])\.ps[\s,{-]/m);
    const space = code("src/styles/provider-space.css");
    expect(space).not.toMatch(/\.ps-(form|grid)\b/);
    expect(src("src/app/provider/messages/[id]/page.tsx")).toMatch(/className="pmsg-head"/);
    expect(src("src/app/provider/search/page.tsx")).toMatch(/className="psrch-form"/);
  });
  test("no inline font sizes in provider page heads", () => {
    for (const f of ["src/app/provider/page.tsx", "src/app/provider/money/page.tsx", "src/app/provider/settings/page.tsx", "src/app/provider/team/page.tsx", "src/app/provider/bookings/page.tsx"])
      expect(src(f), f).not.toMatch(/<h1[^>]*style=/);
  });
});
