import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { lintMigration } from "../../scripts/db/lint.mjs";
import { csvCell } from "../../src/lib/provider/csv";
import { londonYmd, londonStamp } from "../../src/app/admin/(console)/_b/format";

// Q51 admin workspace bug hunt (Phase A, code + DB). Source and pure checks; the live-catalogue block runs only when the
// management API credentials are present (SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY) and is read-only.
const src = (f: string) => readFileSync(f, "utf8");
const A = "src/app/admin/(console)";
const MIG = "supabase/migrations/202611149511_admin_bughunt.sql", GRANTS = "supabase/pending/q51_reviews_column_grants.sql";

test("every admin CSV export neutralises spreadsheet formulas (CSV injection)", () => {
  for (const f of ["agent-integrations", "analytics", "commerce", "partners", "support", "trust"].map(x => `${A}/${x}/export/route.ts`).concat(`${A}/analytics/report/route.ts`)) {
    const s = src(f);
    expect(s, f).toMatch(/csvCell/);
    expect(s, f).not.toMatch(/const esc = \(v: unknown\) => \{ const s = String/);
  }
  for (const f of ["events", "marketplace", "tickets", "users", "workspaces"].map(x => `${A}/${x}/export/route.ts`)) expect(src(f), f).toMatch(/csvCell|\/\^\[=\+\\-@\\t\\r\]\//);
  expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
  expect(csvCell("+44 20 7946 0000")).toBe("'+44 20 7946 0000");
  expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  expect(csvCell("-12.50")).toBe("-12.50");
  expect(csvCell(42)).toBe("42");
});

test("exports honour the page's filters (events, workspaces, marketplace, tickets) and use London dates", () => {
  const ev = src(`${A}/events/export/route.ts`);
  expect(ev).toMatch(/admin_events_page/);
  for (const k of ["type", "status", "when", "vis", "tix", "owner", "city"]) expect(ev).toContain(`"${k}"`);
  expect(src(`${A}/workspaces/export/route.ts`)).toMatch(/workspaceMatches\(/);
  expect(src(`${A}/workspaces/page.tsx`)).toMatch(/workspaceMatches\(/);
  expect(src(`${A}/marketplace/export/route.ts`)).toMatch(/listingMatches\(/);
  expect(src(`${A}/marketplace/page.tsx`)).toMatch(/listingMatches\(/);
  expect(src(`${A}/tickets/export/route.ts`)).toMatch(/ticketEventMatches\(/);
  expect(src(`${A}/tickets/page.tsx`)).toMatch(/ticketEventMatches\(/);
  for (const x of ["users", "workspaces", "tickets", "events"]) expect(src(`${A}/${x}/export/route.ts`), x).not.toMatch(/toISOString\(\)\.slice\(0, 10\)|\.slice\(0, 16\)/);
  // 23:30 UTC on 14 Jul is 00:30 BST on 15 Jul; 23:30 UTC on 14 Nov is still 14 Nov in London (GMT).
  expect(londonYmd("2026-07-14T23:30:00Z")).toBe("2026-07-15");
  expect(londonYmd("2026-11-14T23:30:00Z")).toBe("2026-11-14");
  expect(londonStamp("2026-07-14T23:30:00Z")).toBe("2026-07-15 00:30");
});

test("workspace header and details show the real seller country, never a hard-coded UK flag", () => {
  const w = src(`${A}/workspaces/[id]/page.tsx`);
  expect(w).not.toMatch(/<Flag country="GB" \/>/);
  expect(w.match(/<Flag country=\{sellerCode\} \/>/g)?.length).toBe(2);
  for (const f of ["events/page.tsx", "tickets/page.tsx", "marketplace/page.tsx"]) expect(src(`${A}/${f}`), f).not.toMatch(/, UK["`]/);
  expect(src(`${A}/marketplace/page.tsx`)).not.toMatch(/<Flag country="GB"/);
});

test("reads that fail show the error boundary, not an empty 'nothing here' state", () => {
  expect(src(`${A}/_a/lib.ts`)).toMatch(/export function must</);
  for (const f of ["commerce/payout-pauses/page.tsx", "disputes/page.tsx", "tickets/force-majeure/page.tsx", "health/jobs/page.tsx", "maintenance/page.tsx"]) expect(src(`${A}/${f}`), f).toMatch(/must</);
  const h = src(`${A}/health/page.tsx`);
  expect(h).toMatch(/kill === undefined \? "pending"/);
  expect(h).not.toMatch(/blocked_external: "closed"/);   // "closed" is a green pill
});

test("disputes: tabs, nav and decision forms follow the same permissions as the RLS policies and RPCs", () => {
  const d = src(`${A}/disputes/page.tsx`);
  expect(d).toMatch(/disputes: has\("support"\) \|\| has\("marketplace"\)/);
  expect(d).toMatch(/cancellations: has\("support"\) \|\| has\("commerce"\)/);
  expect(d).toMatch(/chargebacks: has\("support"\) \|\| has\("commerce"\)/);
  const shell = src("src/components/workspace/shell.tsx");
  expect(shell).toMatch(/href: "\/admin\/disputes", label: "Disputes", icon: Headset, perm: \["support", "marketplace", "commerce"\]/);
});

test("dead controls are gone: fake Filters buttons, visual-only row checkboxes, Add country, the dead All chip", () => {
  for (const f of ["agent-integrations/page.tsx", "partners/page.tsx", "trust/view.tsx"]) {
    const s = src(`${A}/${f}`);
    expect(s, f).not.toMatch(/<span className="adb-btn [a-z-]+"><Filter aria-hidden="true" \/>Filters<\/span>/);
    expect(s, f).toMatch(/Clear filters/);
  }
  for (const f of ["agent-integrations/page.tsx", "partners/page.tsx", "trust/view.tsx", "support/page.tsx"]) expect(src(`${A}/${f}`), f).not.toMatch(/<RowCheck/);
  expect(src(`${A}/settings/page.tsx`)).not.toMatch(/Add country/);
  expect(src(`${A}/commerce/view.tsx`)).toMatch(/v === "all" && k !== "f"/);
  expect(src(`${A}/support/[id]/page.tsx`)).not.toMatch(/className="adb-dots" aria-hidden/);
  expect(src(`${A}/commerce/transactions/[id]/page.tsx`)).not.toMatch(/Sarah Mitchell|av-ava-thompson/);
});

test("header consistency: one title scale, one back-link style, back links on every sub-page, no inline font sizes", () => {
  const pwa = src("src/styles/admin-pwa.css");
  expect(pwa).toMatch(/:is\(\.aa \.ws-page-head, \.ao-head, \.adb-head\) h1 \{ font-size: var\(--k-title-admin\); \}/);
  expect(pwa).toMatch(/:is\(\.aa-back, \.adb-back\)/);
  expect(src(`${A}/commerce/reconciliation/page.tsx`)).not.toMatch(/← Commerce/);
  for (const [f, label] of [["commerce/vat/page.tsx", "Back to Commerce"], ["commerce/payout-pauses/page.tsx", "Back to Commerce"], ["tickets/force-majeure/page.tsx", "Back to Tickets"],
    ["maintenance/page.tsx", "Back to Settings"], ["conversations/page.tsx", "Back to Support"], ["trust/review-replies/page.tsx", "Back to Trust & Safety"]] as const) expect(src(`${A}/${f}`), f).toContain(label);
  for (const f of ["maintenance/page.tsx", "maintenance/form.tsx", "commerce/vat/page.tsx"]) expect(src(`${A}/${f}`), f).not.toMatch(/fontSize/);
  const shell = src("src/components/workspace/shell.tsx");
  expect(shell).toMatch(/<AccountMenu name=\{user\.name \|\| "Admin"\}/);
  expect(shell).toMatch(/counts\.support > 0 && <b className="ws-count">/);
});

test("admin moderation of provider review replies: page, action, links", () => {
  const p = src(`${A}/trust/review-replies/page.tsx`);
  expect(p).toMatch(/permissions\.has\("trust"\) && !admin\.permissions\.has\("marketplace"\)/);
  expect(p).toMatch(/moderateReviewReply/);
  expect(p).not.toMatch(/[^_]user_id|[^_]moderation_reason|response_moderated_by/);   // no reviewer identities, only granted columns
  const a = src(`${A}/_d/actions.ts`);
  expect(a).toMatch(/export async function moderateReviewReply\(reviewId: string, hide: boolean, reason: string\)/);
  expect(a).toMatch(/rpc\("moderate_review_response", \{ p_review: reviewId, p_hide: !!hide, p_reason:/);
  expect(src(`${A}/trust/view.tsx`)).toMatch(/href: "\/admin\/trust\/review-replies"/);
  expect(src(`${A}/marketplace/page.tsx`)).toMatch(/href="\/admin\/trust\/review-replies"/);
});

test("migrations: additive, lint-clean, own reviews via my_reviews(), reviews grants deferred to after deploy", () => {
  const m = src(MIG), g = src(GRANTS);
  expect(lintMigration(m).errors).toEqual([]);
  expect(lintMigration(g).errors).toEqual([]);
  expect(m).toMatch(/create or replace function public\.my_reviews\(\)/);
  expect(m).toMatch(/create policy enforcement_actions_read[\s\S]*public\.review_is_mine\(subject_id\)/);
  expect(m).toMatch(/'\^\(https:\/\/\|\/\[\^\/\]\)'/);              // contact_profile: public URLs only
  expect(m).toMatch(/admin_rollback_setting[\s\S]*reason_required[\s\S]*'Rollback to v'/);
  expect(m).toMatch(/'support\.case_unlinked'/);
  expect(m).toMatch(/moderate_review_response[\s\S]*perform public\.admin_mfa_required\(\);/);
  expect(g).toMatch(/revoke select on public\.reviews from authenticated;/);
  expect(g).not.toMatch(/grant select \([^)]*\buser_id\b[^)]*\) on public\.reviews to authenticated/);
  expect(g).not.toMatch(/grant select \([^)]*\bmoderation_reason\b[^)]*\) on public\.reviews to authenticated/);
  for (const f of ["src/app/(customer)/account/page.tsx", "src/app/(customer)/account/reviews/page.tsx", "src/app/api/account/export/route.ts"]) {
    expect(src(f), f).toMatch(/rpc\("my_reviews"/);
    expect(src(f), f).not.toMatch(/from\("reviews"\)[^;]*\.eq\("user_id"/);
  }
  expect(existsSync("scripts/db/exercises/202611149511_admin_bughunt.sql")).toBe(true);
  expect(existsSync("scripts/db/exercises/q51_reviews_column_grants.pending.sql")).toBe(true);
  expect(existsSync("supabase/migrations/202611149512_reviews_column_grants.sql")).toBe(false);   // deploy-gated: never auto-applied
  expect(src(`${A}/_b/actions.ts`)).toMatch(/rollbackSetting[\s\S]*trim\(\)\.length < 5/);
});

const REF = process.env.SUPABASE_PROJECT_REF, PAT = process.env.SUPABASE_PAT_KEY;
async function sql<T>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error(`sql HTTP ${r.status}`);
  return r.json() as Promise<T[]>;
}

test("live catalogue: 202611149511 is applied (read-only)", async () => {
  test.skip(!REF || !PAT, "needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY");
  const [row] = await sql<{ my: boolean; anon_my: boolean; cp: string; rb: string; ul: string; st: string; pol: string }>(`select
    has_function_privilege('authenticated', 'public.my_reviews()', 'execute') my, has_function_privilege('anon', 'public.my_reviews()', 'execute') anon_my,
    pg_get_functiondef('public.contact_profile(text,uuid,uuid)'::regprocedure) cp, pg_get_functiondef('public.admin_rollback_setting(text,integer,text)'::regprocedure) rb,
    pg_get_functiondef('public.admin_unlink_case_record(uuid)'::regprocedure) ul, pg_get_functiondef('public.admin_user_stats()'::regprocedure) st,
    (select qual from pg_policies where tablename = 'enforcement_actions' and policyname = 'enforcement_actions_read') pol`);
  expect(row!.my).toBe(true);
  expect(row!.anon_my).toBe(false);
  expect(row!.cp).toMatch(/\^\(https:\/\/\|\/\[\^\/\]\)/);
  expect(row!.rb).toMatch(/reason_required/);
  expect(row!.ul).toMatch(/support\.case_unlinked/);
  expect(row!.st).toMatch(/verification_checks/);
  expect(row!.pol).toMatch(/review_is_mine/);
  expect(row!.pol).not.toMatch(/FROM reviews/);
});
