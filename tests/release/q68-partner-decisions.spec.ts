import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DEFAULT_PARTNER_PAYOUT_FEES, PARTNER_EARNING_HOLD_DAYS, minimumPartnerPayout, partnerAccountStatus, selfBillVat, statementOutcome } from "../../src/lib/partners/rules";

// Q68 partner decisions + gaps (owner decisions 2026-11-14 + owner update). Pure + source checks only: no browser, no dev server.
// The database half (202611146951) is exercised by scripts/db/exercises/202611146951_partner_decisions.sql at dry-run/apply.
const src = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const MIG = src("supabase/migrations/202611146951_partner_decisions.sql");

test.describe("Q68 · commission base, hold and minimum payout", () => {
  test("minimum payout keeps Connect fees ≤ 5% and never drops below £50", () => {
    expect(minimumPartnerPayout()).toBe(50);   // (2 + 0.10) / 4.75% = 44.2 → floor 50
    expect(minimumPartnerPayout({ ...DEFAULT_PARTNER_PAYOUT_FEES, active_account_fee_gbp: 5 })).toBe(108);   // 5.10 / 4.75% = 107.4 → 108
  });
  test("SQL mirrors the fee formula, the 60-day hold and net-of-VAT ON", () => {
    expect(PARTNER_EARNING_HOLD_DAYS).toBe(60);
    expect(MIG).toMatch(/'partner_commission_net_of_vat', true/);
    expect(MIG).toMatch(/'partner_earning_hold_days', 60/);
    expect(MIG).toMatch(/'active_account_fee_gbp', 2, 'payout_fixed_fee_gbp', 0\.10, 'payout_bps', 25, 'max_fee_bps', 500, 'floor_gbp', 50/);
    expect(MIG).toMatch(/partner_clear_due_earnings\(public\.partner_earning_hold_days\(\)\)/);
  });
  test("credit packs accrue and reverse through the same partner path as invoices", () => {
    expect(MIG).toMatch(/partner_accrue_revenue\(ws\.id, 'pack:' \|\| \(p_session ->> 'id'\)/);
    expect(MIG).toMatch(/partner_refund_source\('pack:' \|\| lot\.payment_ref/);
    expect(MIG).toMatch(/return public\.partner_accrue_revenue\(i\.workspace_id, p_invoice, i\.amount_paid, i\.tax_minor\)/);
  });
});

test.describe("Q68 · statements: rollover, carry-forward, Stripe settlement, self-billing", () => {
  test("closed statements: payable, roll over below the minimum, carry negatives forward", () => {
    expect(statementOutcome(50, 50)).toBe("payable");
    expect(statementOutcome(49.99, 50)).toBe("rolls_over");
    expect(statementOutcome(-0.01, 50)).toBe("carries_negative");
  });
  test("VAT on top only for UK VAT-registered partners; others reverse charge or none", () => {
    expect(selfBillVat(100, true, "GB")).toEqual({ bps: 2000, vat: 20, total: 120, reverseCharge: false });
    expect(selfBillVat(100, true, "IE")).toEqual({ bps: 0, vat: 0, total: 100, reverseCharge: true });
    expect(selfBillVat(100, false, "GB")).toEqual({ bps: 0, vat: 0, total: 100, reverseCharge: false });
  });
  test("transfers-only account status", () => {
    expect(partnerAccountStatus({ payouts_enabled: true, capabilities: { transfers: "active" } })).toBe("active");
    expect(partnerAccountStatus({ details_submitted: true, capabilities: { transfers: "pending" } })).toBe("pending");
    expect(partnerAccountStatus({ requirements: { disabled_reason: "rejected.fraud" } })).toBe("restricted");
    expect(partnerAccountStatus({})).toBe("incomplete");
  });
  test("manual Mark paid and partner money requests are refused server-side", () => {
    expect(MIG).toMatch(/raise exception 'stripe_transfer_required'/);
    expect(MIG).toMatch(/if p_kind = 'partner_payout' then raise exception 'partner_payout_retired'/);
    expect(MIG).toMatch(/if due < 0 then raise exception 'negative_balance'[\s\S]*if due < minimum then raise exception 'below_minimum'/);
    const actions = src("src/app/admin/(console)/_b/actions.ts");
    expect(actions).not.toMatch(/export async function requestPartnerPayout/);
    expect(actions).not.toMatch(/export async function markPartnerStatementPaid/);
    const page = src("src/app/admin/(console)/partners/page.tsx");
    expect(page).not.toMatch(/Process payout/);
    expect(page).toMatch(/action=\{payStatementViaStripe\}/);
  });
  test("one Stripe transfer per statement (DB idempotency key) and a bank payout on the connected account", () => {
    const lib = src("src/lib/partners/payouts.ts");
    expect(MIG).toMatch(/transfer_key = 'partner-statement-' \|\| id \|\| '-'/);
    expect(lib).toMatch(/stripe<\{ id: string \}>\("transfers", \{[\s\S]*\}, \{ idempotencyKey: p\.idempotency_key \}\)/);
    expect(lib).toMatch(/"payouts", \{[\s\S]*\{ stripeAccount: account, idempotencyKey: `partner-payout-\$\{statementId\}` \}/);
    expect(lib).toMatch(/"capabilities\[transfers\]\[requested\]": "true"/);
    expect(lib).toMatch(/"controller\[stripe_dashboard\]\[type\]": "none"/);
    expect(lib).toMatch(/connectCountrySupport\(country\)/);
    expect(lib).toMatch(/transfers\/\$\{r\.transfer_id\}\/reversals/);
  });
});

test.describe("Q68 · partner portal totals only + applications + invites", () => {
  test("the portal reads anonymised referrals and never selects names", () => {
    const data = src("src/app/partner/_data.ts"), page = src("src/app/partner/page.tsx");
    expect(data).toMatch(/sb\.rpc\("partner_portal_referrals"\)/);
    expect(data).not.toMatch(/from\("partner_referrals"\)/);
    expect(page).not.toMatch(/r\.name/);
    expect(page).toMatch(/Referral #\{r\.ref_no\}/);
    expect(MIG).toMatch(/create policy partner_referrals_read on public\.partner_referrals for select to authenticated using \(public\.has_admin_permission\('partners'\)\)/);
  });
  test("self-serve application records versioned terms + self-billing consent; approval is audited and aal2", () => {
    expect(MIG).toMatch(/\(uid, 'partner_terms', true, p_terms_version, 'partner_application'/);
    expect(MIG).toMatch(/\(uid, 'partner_self_billing', true, p_terms_version, 'partner_application'/);
    expect(MIG).toMatch(/function public\.admin_partner_application_decide[\s\S]*?perform public\.admin_require\('partners', p_reason\)/);
    expect(src("src/app/partner/apply/apply-form.tsx")).toMatch(/name="accept_self_billing" required/);
  });
  test("invitations store only a token hash, are email-bound and single-use", () => {
    const inv = src("src/lib/partners/invites.ts");
    expect(inv).toMatch(/const \{ token, hash \} = createInviteToken\(\)/);
    expect(inv).toMatch(/p_token_hash: hash/);
    expect(MIG).toMatch(/if addr is distinct from i\.email then return jsonb_build_object\('result', 'mismatch'\)/);
    expect(MIG).toMatch(/update public\.portal_invites set accepted_at = now\(\), accepted_by = uid/);
  });
});

test.describe("Q68 · organiser promoter screens", () => {
  test("approvals and payout runs need owner / manager / finance; promoter invites owner / manager", () => {
    expect(MIG).toMatch(/has_workspace_role\(e\.workspace_id, array\['owner','manager','finance'\]\)/);
    for (const fn of ["promoter_approve_sales", "promoter_create_payout"]) expect(MIG).toMatch(new RegExp(`FUNCTION public\\.${fn}[\\s\\S]*?not public\\.promoter_money_role\\(p_promoter\\)`));
    expect(MIG).toMatch(/has_workspace_role\(pr\.workspace_id, array\['owner','manager'\]\)/);
  });
  test("the Stripe promoter payout option is gone and the copy says the organiser pays off-platform", () => {
    const form = src("src/app/promoter/payout-form.tsx"), view = src("src/app/promoter/_view.tsx");
    expect(form).not.toMatch(/value: "stripe"/);
    expect(src("src/app/promoter/actions.ts")).toMatch(/\["bank_transfer", "paypal"\]\.includes\(method\)/);
    expect(MIG).toMatch(/p_method not in \('bank_transfer','paypal'\) then raise exception 'invalid_input'/);
    expect(view).toMatch(/pays your commission to you directly/);
    expect(view).not.toMatch(/payment provider collects your bank details/);
    expect(src("src/app/organizer/events/[id]/promotion/promoters/[promoterId]/page.tsx")).toMatch(/You pay this promoter’s commission yourself/);
  });
});
