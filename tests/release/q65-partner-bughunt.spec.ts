import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { LANDING, channelOf, parsePartnerCookie, partnerCookieValue } from "../../src/lib/partners/referral";

// Q50/Q65 partner workspace + commission payouts bug hunt (phase A, code level). Pure + source checks only: no browser, no dev server.
// The database half (202611146401) is exercised by scripts/db/exercises/202611146401_partner_bughunt_fixes.sql at dry-run/apply.
const src = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test.describe("Q65 · partner link attribution", () => {
  test("the portal's sign-up link and the UK-spelt organisers page keep ?ref=", () => {
    for (const p of ["/", "/register", "/register/organizer", "/organisers", "/organizers", "/pricing", "/providers", "/signup"]) expect(LANDING.test(p), p).toBe(true);
    for (const p of ["/events", "/events/x", "/account", "/partner", "/registered"]) expect(LANDING.test(p), p).toBe(p === "/partner");
  });
  test("the consented cookie carries the click time; legacy two-part cookies still parse", () => {
    const at = Date.UTC(2026, 10, 14, 12, 0, 0);
    const v = partnerCookieValue("ACME_1", "instagram", at);
    expect(v).toBe(`ACME_1:instagram:${at / 1000}`);
    expect(parsePartnerCookie(v)).toEqual({ code: "ACME_1", channel: "instagram", clickedAt: "2026-11-14T12:00:00.000Z" });
    expect(parsePartnerCookie("ACME_1:qr")).toEqual({ code: "ACME_1", channel: "qr", clickedAt: null });
    expect(parsePartnerCookie("ACME_1:myspace:abc")).toEqual({ code: "ACME_1", channel: "other", clickedAt: null });
    expect(parsePartnerCookie("bad code!:link:1")).toBeNull();
    expect(parsePartnerCookie(undefined)).toBeNull();
    expect(channelOf(null)).toBe("link");
  });
  test("sign-in attribution uses the click-time RPC when the cookie has it", () => {
    const s = src("src/lib/partners/referral.ts");
    expect(s).toMatch(/partner_attribute_signup_at" as never, \{ p_code: c\.code, p_channel: c\.channel, p_visitor: visitor, p_clicked_at: c\.clickedAt \}/);
    expect(s).toMatch(/if \(consent === "yes"\) return \{ cookie: partnerCookieValue\(canonical, channel\) \}/);
    expect(src("src/app/ref/[code]/page.tsx")).toMatch(/jar\.set\(PARTNER_COOKIE, partnerCookieValue\(code, channel\), partnerCookieOptions\(secure\)\)/);
  });
  test("QR scans and social shares are counted under their own channel", () => {
    expect(src("src/app/partner/qr/route.ts")).toMatch(/\/\?ref=\$\{encodeURIComponent\(code\)\}&c=qr/);
    expect(src("src/app/partner/page.tsx")).toMatch(/path=\{`\$\{link\}&c=\$\{nw\}`\}/);
  });
});

test.describe("Q65 · partner portal figures follow the ledger", () => {
  const page = src("src/app/partner/page.tsx");
  test("next payout and pending payout include cleared 'open' statements", () => {
    expect(page).toMatch(/statements\.filter\(s => \(s\.status === "open" \|\| s\.status === "pending"\) && s\.payout_due\)/);
    // Q68: unpaid statements (incl. processing) count their balance incl. carried-in amounts.
    expect(page).toMatch(/const unpaid = statements\.filter\(s => s\.status === "open" \|\| s\.status === "pending" \|\| s\.status === "processing"\)/);
    expect(page).toMatch(/const pendingCom = holdCom \+ unpaid\.reduce\(\(a, s\) => a \+ balance\(s\), 0\)/);
  });
});

test.describe("Q65 · promoter portal", () => {
  const view = src("src/app/promoter/_view.tsx");
  test("held / payable sales render (a missing SALE_TONE key crashed the sales table)", () => {
    expect(view).toMatch(/held: \["purple", "In payout"\], payable: \["green", "Payable"\]/);
    expect(view).toMatch(/SALE_TONE\[s\.status\] \?\? \["grey", s\.status\]/);
    expect(src("src/app/promoter/_data.ts")).toMatch(/status: "pending" \| "approved" \| "held" \| "payable" \| "paid" \| "reversed"/);
  });
  test("plain-link and QR sales appear in the channel breakdown", () => {
    expect(view).toMatch(/\["link", "qr", "instagram", "tiktok", "facebook", "x", "email", "whatsapp", "direct", "other"\]/);
    expect(src("src/components/portal/brand.tsx")).toMatch(/link: "Link", qr: "QR code"/);
  });
});

test.describe("Q65 · admin partner payouts", () => {
  const page = src("src/app/admin/(console)/partners/page.tsx");
  test("money figures come from partner_earnings / partner_statements, not seeded rollups", () => {
    expect(page).toMatch(/db\.from\("partner_earnings"\)/);
    expect(page).toMatch(/db\.from\("partner_statements"\)/);
    expect(page).not.toMatch(/details\.pending \?\? Math\.max\(0, p\.earned - p\.paid\)/);
    expect(page).not.toMatch(/Math\.round\(\(r \* p\.commission_bps\) \/ 10000\)/);
  });
  // Q68 (owner update 2026-11-14) superseded manual "Mark paid": closed, payable statements are paid with "Pay via Stripe".
  test("statements of closed months are paid via Stripe with a reason", () => {
    expect(page).toMatch(/<ActionButton action=\{payStatementViaStripe\} args=\{\[st\.id\]\} reason/);
    expect(page).toMatch(/const payable = unpaid && closed && bal >= minimum && p\.payout_status === "active"/);
  });
});

test.describe("Q65 · migration 202611146401", () => {
  const sql = src("supabase/migrations/202611146401_partner_bughunt_fixes.sql");
  test("promoter clicks keep link / qr", () => expect(sql).toMatch(/p_channel in \('direct','link','qr','instagram'/));
  test("clawbacks only net paid commission; a failed payout reverses its clawed sales", () => {
    expect(sql).toMatch(/s\.clawback_pending and s\.clawback_payout_id is null and op\.status = 'paid'/);
    expect(sql).toMatch(/set status = 'reversed', payout_id = null, clawback_pending = false where payout_id = p\.id and clawback_pending/);
  });
  test("earnings clear after the 14-day hold on a daily schedule", () => {
    expect(sql).toMatch(/cutoff timestamptz := now\(\) - make_interval\(days => greatest\(coalesce\(p_hold_days, 14\), 0\)\)/);
    expect(sql).toMatch(/cron\.schedule\('partner-clear-earnings', '50 5 \* \* \*'/);
  });
  test("existing accounts are refused and partner payout requests are capped and single", () => {
    expect(sql).toMatch(/if created < p_clicked_at - interval '10 minutes' then return jsonb_build_object\('attributed', false, 'reason', 'existing_account'\)/);
    expect(sql).toMatch(/raise exception 'partner_payout_already_requested'/);
    expect(sql).toMatch(/if round\(p_amount, 2\) > owed then raise exception 'partner_payout_exceeds_cleared'/);
  });
});
