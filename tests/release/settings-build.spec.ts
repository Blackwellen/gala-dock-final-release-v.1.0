import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { accentVars, brandAccent, contrast, parseHex, readableOn } from "../../src/lib/brand/accent";
import { emailChangeError, emailChangeProblem, ownershipError, planLimitError, removeMemberError, ORG_NOTIFICATION_SWITCHES, MANDATORY_NOTIFICATIONS } from "../../src/lib/settings/rules";
import { planChangeParams, planVatCopy, portalConfigurationParams, portalSessionParams, subscriptionTaxIdParams, taxParams, PORTAL_ROLES } from "../../src/lib/billing/core";
import { platformBillingStripe, PaymentRouteError, type StripeClient, type StripeRequest } from "../../src/lib/payments/stripe-client";

// Q67 settings & billing build (owner decisions 2026-11-14). Pure, stubbed and source checks only: no network, no dev server.
// The database half (notification switches, plan limits, ownership transfer, brand lookups, email-change hook) is exercised by
// scripts/db/exercises/202611146901_settings_billing_build.sql (dry-run passed before apply).
const src = (f: string) => readFileSync(f, "utf8");
const MIG = "supabase/migrations/202611146901_settings_billing_build.sql";

test("brand colour is clamped to WCAG AA on white and gets a readable text colour", () => {
  for (const hex of ["#FFFF00", "#a3e635", "#22d3ee", "#ffffff", "#2563EB", "#000000", "#ff2bd6"]) {
    const b = brandAccent(hex)!;
    expect(contrast(parseHex(b.accent)!, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseHex(b.accent)!, parseHex(b.onAccent)!)).toBeGreaterThanOrEqual(4.5);
  }
  expect(brandAccent("#1d4ed8")!.accent).toBe("#1d4ed8");                 // already accessible: unchanged
  expect(brandAccent("red; background:url(x)")).toBeNull();                // never injects CSS
  expect(accentVars("nope")).toEqual({});
  expect(Object.keys(accentVars("#123456"))).toEqual(["--org-accent", "--org-accent-on", "--org-accent-soft"]);
  expect(readableOn("#ffffff")).not.toBe("#ffffff");
});

test("brand accent touches organiser content only (event page, portal KPI icons, posters, studio), not core chrome", () => {
  const css = src("src/styles/cu-public-event.css"), portal = src("src/styles/portal-client.css");
  const rules = css.slice(css.indexOf("Q67 organiser brand accent"));
  expect(rules).toMatch(/\.pe-branded \.pe3-type/);
  expect(rules).not.toMatch(/k-btn|site-header|\.primary/);
  expect(portal.slice(portal.indexOf("Q67"))).not.toMatch(/pt-top|pt-side|k-btn/);
  expect(src("src/app/events/[slug]/page.tsx")).toMatch(/public_event_brand/);
  expect(src("src/app/portal/[token]/page.tsx")).toMatch(/portal_brand/);
  expect(src("src/components/organizer/poster-builder.tsx")).toMatch(/accent: brand \?\? ACCENTS\[0\]/);
  expect(src("src/app/studio/[id]/page.tsx")).toMatch(/Workspace brand colour/);
  const m = src(MIG);
  expect(m).toMatch(/grant execute on function public\.public_event_brand\(uuid\) to anon/);
  expect(m).toMatch(/revoke all on function public\.workspace_brand_color\(uuid\) from public, anon;/);
  expect(m).toMatch(/where c ~ '\^#\[0-9A-Fa-f\]\{6\}\$'/);                 // only a hex value ever leaves the database
});

test("email change: validation, reauth before updateUser, notice to the old address, audit, rate limit", () => {
  expect(emailChangeProblem("a@galadock.com", "A@GALADOCK.COM")).toMatch(/already your/);
  expect(emailChangeProblem("a@galadock.com", "x@example.com")).toMatch(/can't receive/);
  expect(emailChangeProblem("a@galadock.com", "not-an-email")).toMatch(/valid/);
  expect(emailChangeProblem("a@galadock.com", "b@galadock.co.uk")).toBeNull();
  expect(emailChangeError({ code: "email_exists" })).toMatch(/another Gala Dock account/);
  expect(emailChangeError({ code: "insufficient_aal" })).toMatch(/authenticator/);
  const a = src("src/lib/actions/account-security.ts");
  expect(a.indexOf("rateLimit(`email-change:")).toBeGreaterThan(-1);
  expect(a.indexOf("reauthenticate(")).toBeLessThan(a.indexOf("auth.updateUser("));
  expect(a).toMatch(/kind: "security", title: "Email change requested"/);
  expect(a).toMatch(/auth\.email_change_requested/);
  const r = src("src/lib/settings/reauth.ts");
  expect(r).toMatch(/rpc\("verify_my_password"/);
  expect(r).toMatch(/rpc\("require_step_up"/);
  expect(src("src/app/auth/confirm/route.ts")).toMatch(/type === "email_change"/);
  const m = src(MIG);
  expect(m).toMatch(/create trigger gd_account_email_changed after update of email on auth\.users/);
  expect(m).toMatch(/exception when others then null;   -- never block authentication/);
  expect(m).toMatch(/'billing\.sync_customer_contact'/);
});

test("ownership transfer: owner-only, typed name, step-up, blockers, accept-by-new-owner, atomic swap, audit, Stripe contact job", () => {
  const m = src(MIG);
  const req = m.slice(m.indexOf("function public.request_ownership_transfer"), m.indexOf("function public.cancel_ownership_transfer"));
  expect(req).toMatch(/w\.owner_id is distinct from uid/);
  expect(req).toMatch(/require_step_up\(p_ws\)/);
  expect(req).toMatch(/confirm_mismatch/);
  expect(req).toMatch(/m\.role = 'manager'/);
  expect(req).toMatch(/transfer_blocked:/);
  const acc = m.slice(m.indexOf("function public.respond_ownership_transfer"));
  expect(acc).toMatch(/t\.to_user is distinct from uid/);
  expect(acc).toMatch(/for update/);
  expect(acc.indexOf("set role = 'manager'")).toBeLessThan(acc.indexOf("set owner_id = uid"));
  expect(acc).toMatch(/workspace\.ownership_transferred/);
  expect(acc).toMatch(/enqueue_job\('billing\.sync_customer_contact'/);
  for (const code of ["open_dispute", "open_chargeback", "payout_pause", "billing_overdue", "target_deleting", "target_mfa"]) expect(m).toContain(`'${code}'`);
  expect(m).toMatch(/workspace_ownership_transfers_one_pending .* where status = 'pending'/);
  expect(ownershipError("confirm_mismatch")).toMatch(/workspace name/);
  expect(ownershipError("transfer_blocked:payout_pause", "Payouts are paused")).toBe("Payouts are paused");
  expect(ownershipError("step_up_required")).toMatch(/authenticator/);
  const act = src("src/lib/actions/ownership.ts");
  expect(act.match(/reauthenticate\(/g)?.length).toBe(2);                 // both the owner and the new owner re-authenticate
});

test("organiser notification switches reach delivery; mandatory kinds are locked; SMS/marketing no longer over-claim", () => {
  expect(ORG_NOTIFICATION_SWITCHES.map(s => s.key)).toEqual(["in_app", "email", "agent"]);
  expect(MANDATORY_NOTIFICATIONS.join(" ")).toMatch(/Security.*Payments.*Disputes.*Legal/);
  const m = src(MIG);
  expect(m).toMatch(/create trigger gd_notification_workspace_prefs before insert on public\.notifications/);
  expect(m).toMatch(/if public\.notification_mandatory\(new\.kind\) then return new; end if;/);
  expect(m).toMatch(/new\.kind = 'agent' or new\.kind like 'agent\.%'/);   // approvals (agent_approval) are never dropped
  expect(m).toMatch(/billing\|chargeback\|legal\|terms\|policy/);
  expect(m).toMatch(/insert into public\.notifications\(user_id, kind, title, body, link, workspace_id\)/);   // notify_workspace records the workspace
  const ui = src("src/components/organizer/settings-client.tsx");
  expect(ui).toMatch(/Not available yet/);
  expect(ui).toMatch(/Always sent/);
  expect(ui).not.toMatch(/\["sms", "SMS notifications"\]/);
  expect(src("src/lib/data/context.ts").match(/filter\("muted", "eq", false\)/g)?.length).toBe(2);
});

test("plan limits: enforced in the database on new creation/publish only, with upgrade copy everywhere it can surface", () => {
  const m = src(MIG);
  expect(m).toMatch(/array\['draft','archived','completed','cancelled'\]/);
  expect(m).toMatch(/already active/);
  expect(m).toMatch(/l\.published and l\.paused_at is null/);
  expect(m).toMatch(/i\.accepted_at is null and i\.declined_at is null\s+and i\.revoked_at is null and i\.expires_at > now\(\)/);
  expect(m).toMatch(/public\.is_demo_workspace\(p_ws\) or coalesce\(\(select w\.is_test_fixture/);
  expect(m).toMatch(/pg_advisory_xact_lock/);
  const e = planLimitError({ message: "plan_limit_reached:events", details: JSON.stringify({ limit: "events", used: 3, max: 3, plan: "starter" }) })!;
  expect(e).toMatch(/Starter plan includes 3 active events/);
  expect(e).toMatch(/nothing you already have is affected/);
  expect(planLimitError({ message: "plan_limit_reached:seats" })).toMatch(/team seat/);
  expect(planLimitError({ message: "boom" })).toBeNull();
  expect(removeMemberError("plan_limit_reached:seats")).toMatch(/free team seat/);
  for (const f of ["src/lib/workspace/rpc.ts", "src/lib/events/lifecycle.ts", "src/lib/actions/create-event.ts", "src/lib/actions/team.ts"]) expect(src(f)).toMatch(/planLimitError/);
  expect(src("src/lib/workspace/invites.ts")).toMatch(/plan_limit_reached:seats/);
  expect(src("src/app/organizer/money/page.tsx")).toMatch(/reporting_advanced/);
});

test("customer portal: owner/finance, mode-matched customer, sandbox-only auto config, return to the billing tab", async () => {
  expect([...PORTAL_ROLES]).toEqual(["owner", "finance"]);
  const cfg = portalConfigurationParams({ returnUrl: "https://x/organizer/settings?tab=billing", privacyUrl: "https://x/privacy", termsUrl: "https://x/terms" });
  expect(cfg).toMatchObject({ "features[payment_method_update][enabled]": "true", "features[invoice_history][enabled]": "true", "features[subscription_cancel][mode]": "at_period_end", "features[subscription_update][enabled]": "false", "metadata[gd_purpose]": "plans" });
  expect(portalSessionParams({ customer: "cus_1", returnUrl: "r", configuration: "bpc_1" })).toEqual({ customer: "cus_1", return_url: "r", configuration: "bpc_1" });
  const calls: StripeRequest[] = [];
  const fake: StripeClient = { async request<T>(r: StripeRequest) { calls.push(r); return { id: "bps_1", url: "https://billing.stripe.com/x" } as T; } };
  const s = platformBillingStripe(fake);
  await s.createPortalSession({ customer: "cus_1", return_url: "r", configuration: "bpc_1" });
  expect(calls[0]).toMatchObject({ method: "POST", path: "billing_portal/sessions" });
  expect(calls[0]!.stripeAccount).toBeUndefined();                          // platform account, never a seller's
  expect(() => s.createPortalSession({ customer: "acct_1" })).toThrow(PaymentRouteError);
  const svc = src("src/lib/billing/service.ts");
  expect(svc).toMatch(/if \(billingLive\(\)\) throw new BillingModeError\("billing_portal_unconfigured"\)/);
  expect(svc).toMatch(/!!bc\.livemode !== live/);
  expect(src("src/components/billing/plan-billing.tsx")).toMatch(/openBillingPortalAction/);
  expect(src("scripts/billing/stripe-portal-config.mjs")).toMatch(/\(sk\|rk\)_test_/);
});

test("VAT: automatic tax + customer VAT ids at checkout, plan changes, VAT number on Checkout-created subscriptions, truthful copy", () => {
  expect(taxParams(true)).toMatchObject({ "automatic_tax[enabled]": "true", "tax_id_collection[enabled]": "true" });
  expect(taxParams(false)).toEqual({});
  expect(planChangeParams({ itemId: "si", price: "price_x", direction: "upgrade", currentPlan: "pro", periodEnd: 0, automaticTax: true })).toMatchObject({ "automatic_tax[enabled]": "true" });
  expect(Object.keys(planChangeParams({ itemId: "si", price: "price_x", direction: "upgrade", currentPlan: "pro", periodEnd: 0 }))).not.toContain("automatic_tax[enabled]");
  expect(subscriptionTaxIdParams(["txi_abc", "bad"])).toEqual({ "invoice_settings[account_tax_ids][0]": "txi_abc" });
  expect(planVatCopy(true)).toMatch(/added at checkout/);
  expect(planVatCopy(false)).toMatch(/not added/);
  expect(planVatCopy(false)).not.toMatch(/exclude/);
  expect(src("src/app/api/stripe/webhook/route.ts")).toMatch(/applySubscriptionTaxIds\(str\(object\.subscription\)\)/);
  expect(src("src/components/site/pricing/pricing-client.tsx")).toMatch(/vatAdded \?/);
  const rb = src("docs/release/CLOSE_OUT_RUNBOOK.md");
  expect(rb).toMatch(/BILLING_AUTOMATIC_TAX/);
  expect(rb).toMatch(/GB508480488/);
});
