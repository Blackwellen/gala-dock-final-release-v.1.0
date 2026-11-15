import * as nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace } from "../phase1/helpers";
import { lintMigration } from "../../scripts/db/lint.mjs";
import { stripeDashboardUrl } from "../../src/app/admin/(console)/_b/format";
import { unsubscribeToken, verifyUnsubscribeToken, unsubscribeHeaders, isOptionalEmailCategory } from "../../src/lib/email/rules";
import * as registry from "../../src/lib/agent/registry";
import * as plan from "../../src/lib/agent/plan";
import * as minimiseMod from "../../src/lib/agent/minimise";
import * as prompt from "../../src/lib/agent/prompt";
import * as skills from "../../src/lib/agent/skills";
import * as watch from "../../src/lib/agent/watch";
import * as resilience from "../../src/lib/agent/resilience";

// Q75 leftovers lane (Phase A: code + DB). Source and pure checks, the migrations' exercises re-run read-only against the live
// catalogue (each ends by raising EXERCISE_OK, so everything it wrote is rolled back), and one stubbed-model runtime check on a
// fixture run held under a lease (the live pg_cron worker never claims it; no Azure call, no live agent tool call).
const src = (f: string) => readFileSync(f, "utf8");
const A = "src/app/admin/(console)";
const MIGS = ["202611147501_q75_leftovers", "202611147502_q75_public_reports", "202611147503_q75_commerce_by_currency"];
const REF = process.env.SUPABASE_PROJECT_REF, PAT = process.env.SUPABASE_PAT_KEY;
async function sqlRaw(query: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  return { ok: r.ok, text: await r.text() };
}

test.describe("Q75 migrations", () => {
  test("lint clean (additive) and recorded in the manifest", () => {
    const manifest = JSON.parse(src("supabase/migration-manifest.json")) as { reviewed: { file: string; exercise?: string }[] };
    for (const m of MIGS) {
      expect(lintMigration(src(`supabase/migrations/${m}.sql`)).errors, m).toEqual([]);
      expect(manifest.reviewed.find(r => r.file === `${m}.sql`)?.exercise, m).toBe(`scripts/db/exercises/${m}.sql`);
    }
  });
  test("exercises pass against the live database (rolled back)", async () => {
    test.skip(!REF || !PAT, "needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY");
    test.setTimeout(180_000);
    for (const m of MIGS) {
      const r = await sqlRaw(src(`scripts/db/exercises/${m}.sql`));
      expect(r.ok, m).toBe(false);                       // the deliberate EXERCISE_OK exception is the rollback guarantee
      expect(r.text, m).toMatch(/EXERCISE_OK/);
    }
  });
  test("new functions: service-only where they must be, invoker summary for admins", async () => {
    test.skip(!REF || !PAT, "needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY");
    const r = await sqlRaw(`select json_build_object(
      'rt_auth', has_function_privilege('authenticated', 'public.agent_run_time_check(uuid)', 'execute'),
      'traced_auth', has_function_privilege('authenticated', 'public.record_ai_usage_traced(uuid,uuid,uuid,text,text,integer,integer,integer,uuid,text)', 'execute'),
      'refund5_auth', has_function_privilege('authenticated', 'public.post_stripe_refund_delta(text,bigint,text,text,text)', 'execute'),
      'public_report_anon', has_function_privilege('anon', 'public.report_content_public(text,uuid,text,text,text,text)', 'execute'),
      'summary_anon', has_function_privilege('anon', 'public.admin_commerce_summary(integer,timestamptz,boolean)', 'execute'),
      'summary_definer', (select prosecdef from pg_proc where oid = 'public.admin_commerce_summary(integer,timestamptz,boolean)'::regprocedure),
      'cron', (select schedule from cron.job where jobname = 'agent-retention'),
      'premises', (select applies from public.compliance_rules where pack_key = 'gb-eng-wal' and key = 'premises_or_ten')) j`);
    expect(r.ok).toBe(true);
    const j = (JSON.parse(r.text) as { j: Record<string, unknown> }[])[0]!.j;
    expect(j).toMatchObject({ rt_auth: false, traced_auth: false, refund5_auth: false, public_report_anon: false, summary_anon: false, summary_definer: false, cron: "15 4 * * *" });
    expect(JSON.stringify(j.premises)).toContain("late_night_refreshment");
    expect(JSON.stringify(j.premises)).not.toMatch(/"late_night"/);
  });
});

test.describe("Q51 admin notes", () => {
  test("Trust: the default 'Last 30 days' filters the list; 'Any time' shows everything", () => {
    const v = src(`${A}/trust/view.tsx`);
    expect(v).not.toMatch(/!s\("range"\) \|\| new Date\(c\.updated_at\)/);
    expect(v).toMatch(/s\("range"\) === "all" \|\| new Date\(c\.updated_at\)/);
    expect(v.match(/value: "all", label: "Any time"/g)?.length).toBe(2);
  });
  test("Commerce totals come from SQL (per currency), the table pages past the 1,000-row cap and says when it is truncated", () => {
    const d = src(`${A}/commerce/data.ts`), v = src(`${A}/commerce/view.tsx`), x = src(`${A}/commerce/export/route.ts`);
    expect(d).toMatch(/admin_commerce_summary/);
    expect(d).toMatch(/\.range\(off, /);
    expect(d).toMatch(/totalsByCurrency/);
    expect(v).not.toMatch(/gmv\(cur\)|platformRevenue\(cur\)|bySource\(cur/);
    expect(v).toMatch(/T\.money\("gmv"\)/);
    expect(v).toMatch(/const md = \(k: MoneyKey\) => \(T\.multi \? null/);   // no delta across currencies
    expect(v).toMatch(/truncated && /);
    expect(v).not.toMatch(/money\(t\.amount, "GBP"/);                          // each ledger line in its own currency
    expect(x).toMatch(/\["metric", "currency", "value"\]/);
    expect(x).toMatch(/ledgerRows\(ctx\.db, now - days \* 864e5, now, 200_000\)/);
  });
  test("Retry only on failed payouts (UI + RPC); scheduled payouts are not 'payout failures'", () => {
    const v = src(`${A}/commerce/view.tsx`), m = src("supabase/migrations/202611147501_q75_leftovers.sql");
    expect(v).toMatch(/const retryable = \(t: Tx\) => t\.status === "failed"/);
    expect(v).toMatch(/\{retryable\(t\) \? <ActionButton action=\{retryPayout\}/);
    expect(v).toMatch(/t\.kind === "payout" && t\.status === "failed"\);/);
    expect(m).toMatch(/if t\.kind <> 'payout' or t\.status <> 'failed' then raise exception 'not_retryable'/);
    expect(m).toMatch(/retry_already_requested/);
  });
  test("Open in Stripe: platform search for platform charges, connected-account URL for direct charges, hidden when unknown", () => {
    expect(stripeDashboardUrl("pi_123", { platform: true, account: null }, false)).toBe("https://dashboard.stripe.com/test/search?query=pi_123");
    expect(stripeDashboardUrl("pi_123", { platform: false, account: "acct_1Abc" }, true)).toBe("https://dashboard.stripe.com/acct_1Abc/payments/pi_123");
    expect(stripeDashboardUrl("po_9", { platform: false, account: "acct_1Abc" }, false)).toBe("https://dashboard.stripe.com/acct_1Abc/test/payouts/po_9");
    expect(stripeDashboardUrl("pi_123", { platform: false, account: null }, false)).toBeNull();
    expect(stripeDashboardUrl("pi_123", { platform: false, account: "acct_x/../evil" }, false)).toBeNull();
    const p = src(`${A}/commerce/transactions/[id]/page.tsx`);
    expect(p).toMatch(/admin_transaction_stripe_target/);
    expect(p).not.toMatch(/dashboard\.stripe\.com\/search\?query=/);
  });
  test("transaction page links only into areas this admin can open", () => {
    const p = src(`${A}/commerce/transactions/[id]/page.tsx`);
    for (const [perm, href] of [["tickets", "/admin/tickets?tab=orders"], ["support", "/admin/support/"], ["trust", "/admin/trust"], ["workspaces", "/admin/workspaces/"], ["users", "custLink"]] as const) {
      for (const m of p.matchAll(new RegExp(`.{0,120}${href.replace(/[?/.]/g, x => `\\${x}`)}`, "g"))) expect(m[0], `${perm}: ${m[0]}`).toMatch(new RegExp(`can\\("${perm}"\\)|const custLink`));
    }
  });
  test("Support 'Open cases' delta compares new cases with new cases", () => {
    const s = src(`${A}/support/page.tsx`);
    expect(s).toMatch(/delta=\{delta\(all\.filter\(c => win\(c, now - W, now \+ 1\)\)\.length, all\.filter\(c => win\(c, now - 2 \* W, now - W\)\)\.length\)\} suffix="new cases vs last 7 days"/);
  });
});

test.describe("Q56 / Q55 / routes / messaging + legal add-ons (source and pure)", () => {
  test("boosts: spend for owner/manager/finance only; legacy click route records nothing", () => {
    expect(src("src/app/organizer/events/[id]/promotion/page.tsx")).toMatch(/!ctx\.canMoney \? Promise\.resolve\(\{ data: \[\] as BoostRow\[\] \}\)/);
    const r = src("src/app/api/boosts/[id]/click/route.ts");
    expect(r).not.toMatch(/\.rpc\(|createClient/);
    expect(r).toMatch(/\/\^\\\/events\\\/\[a-z0-9-\]\{1,120\}\$\/i/);
    expect(src("supabase/pending/q75_retire_legacy_boost_rpcs.sql")).toMatch(/revoke execute on function public\.record_boost_event\(uuid, text\) from anon, authenticated, public;/);
    expect(src("src/app/api/stripe/webhook/route.ts")).toMatch(/p_payment_intent: str\(charge\.payment_intent\) \|\| null/);
  });
  test("builders: keyboard seat list, poster undo bursts + failure count, studio CORS notice, no-op commits", () => {
    const pb = src("src/components/venue-plan/plan-builder.tsx");
    expect(pb).toMatch(/<select multiple size=\{Math\.min\(6, seatList\.length\)\}/);
    expect(pb).toMatch(/if \(!prev && \(n === cur \|\| \(n\.length === cur\.length && JSON\.stringify\(n\) === JSON\.stringify\(cur\)\)\)\) return cur;/);
    const po = src("src/components/organizer/poster-builder.tsx");
    expect(po).toMatch(/now - lastEdit\.at < 1000/);
    expect(po).toMatch(/— \$\{failed\} failed\./);
    const st = src("src/components/media/studio.tsx");
    expect(st).toMatch(/if \(before === JSON\.stringify\(next\)\) return;/);
    expect(st).toMatch(/report\.dropped/);
    expect(src("src/components/media/export.ts")).toMatch(/img\.remove\(\); if \(report\) report\.dropped\+\+;/);
  });
  test("/venues and /services 308 to the public directory", () => {
    const cfg = src("next.config.ts"), site = src("src/lib/public/site.ts");
    expect(cfg).toMatch(/\{ source: "\/venues", destination: "\/discover\?tab=venues&results=1", permanent: true \}/);
    expect(cfg).toMatch(/\{ source: "\/services", destination: "\/discover\?tab=services&results=1", permanent: true \}/);
    expect(site).toMatch(/browseVenues: "\/discover\?tab=venues&results=1"/);
    expect(site).toMatch(/browseSuppliers: "\/discover\?tab=services&results=1"/);
  });
  test("one-click unsubscribe (RFC 8058): signed per user + optional category; mandatory mail has none", () => {
    const sec = "test-secret-not-real", uid = "0f0e0d0c-0b0a-4908-8706-050403020100";
    const t = unsubscribeToken(sec, uid, "tickets")!;
    expect(verifyUnsubscribeToken(sec, t)).toEqual({ userId: uid, category: "tickets" });
    expect(verifyUnsubscribeToken("other", t)).toBeNull();
    expect(verifyUnsubscribeToken(sec, t.replace(".tickets.", ".messages."))).toBeNull();
    expect(unsubscribeToken(sec, uid, "payments")).toBeNull();
    expect(isOptionalEmailCategory("security")).toBe(false);
    expect(unsubscribeHeaders("https://x.test", sec, uid, "payments")).toBeUndefined();
    const h = unsubscribeHeaders("https://x.test", sec, uid, "reminders")!;
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(h["List-Unsubscribe"]).toMatch(/^<https:\/\/x\.test\/api\/email\/unsubscribe\?t=[^>]+>, <https:\/\/x\.test\/account\?tab=notifications>$/);
    const route = src("src/app/api/email/unsubscribe/route.ts");
    expect(route).toMatch(/export async function POST/);
    expect(route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"))).not.toMatch(/update\(/);   // GET never changes anything
    expect(src("src/lib/email/send.ts")).toMatch(/headers: unsubscribeHeaders\(site\(\), unsubscribeSecret\(\), r\.user_id, r\.category\)/);
  });
  test("push / SMS hidden; legacy thread composer has no dead attach buttons; provider alerts carry the workspace", () => {
    expect(src("src/app/provider/settings/page.tsx")).not.toMatch(/<th>SMS<\/th>|_sms`/);
    expect(src("src/app/provider/settings/actions.ts")).not.toMatch(/_sms/);
    expect(src("src/components/organizer/settings-client.tsx")).not.toMatch(/SMS alerts/);
    expect(src("src/components/onboarding.tsx")).not.toMatch(/Push \(installed app\)/);
    expect(src("src/components/customer/guests-client.tsx")).not.toMatch(/aria-label="Attach (file|image|document)"/);
    expect(src("src/lib/actions/build.ts")).toMatch(/workspace_id: \(l as \{ workspace_id\?: string \} \| null\)\?\.workspace_id/);
    expect(src("src/lib/actions/marketplace.ts")).toMatch(/user_id: o\.owner_id, workspace_id: o\.id/);
    expect(src("src/lib/actions/request-edit.ts")).toMatch(/user_id: w\.owner_id, workspace_id: w\.id/);
  });
  test("legal add-ons: admin nav for Moderation / Compliance, public report form", () => {
    const sh = src("src/components/workspace/shell.tsx");
    expect(sh).toMatch(/href: "\/admin\/moderation", label: "Moderation", icon: Flag, perm: "trust"/);
    expect(sh).toMatch(/href: "\/admin\/compliance", label: "Compliance", icon: Scale, perm: \["commerce", "trust"\]/);
    const rc = src("src/components/safety/report-content.tsx");
    expect(rc).toMatch(/reportContentPublic\(subject, id, reason, note, email, captcha\)/);
    expect(rc).toMatch(/<Turnstile onToken=\{onToken\}/);
    const a = src("src/lib/actions/reports.ts");
    expect(a).toMatch(/turnstileOk\(turnstile, req\)/);
    expect(a).toMatch(/rateLimit\(`content-report-public:\$\{ip\}`/);
    expect(a).toMatch(/createAdminClient\(\)\.rpc\("report_content_public"/);
  });
});

// ── Q53: max_run_minutes enforced by the runtime (stubbed model, held lease) ─────────────────────────────────────────────────────
function load<T>(file: string, deps: Record<string, unknown>): T {
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  const req = (n: string) => { if (n in deps) return deps[n]; throw new Error(`unexpected import ${n}`); };
  new Function("require", "module", "exports", "process", js)(req, mod, mod.exports, process);
  return mod.exports as T;
}
class AgentBudgetError extends Error {}
class AgentSafetyError extends Error {}
test.describe("Q53 run time limit (fixture workspace)", () => {
  test.describe.configure({ mode: "serial" });
  const db = admin as unknown as SupabaseClient;
  let owner: { id: string }, ws: string;
  test.beforeAll(async () => { owner = await createUser("q75-agent"); ws = await seedWorkspace(owner.id, "organizer", `Q75 ${nodeCrypto.randomBytes(2).toString("hex")}`); });
  test.afterAll(async () => {
    await db.from("agent_runs").delete().eq("workspace_id", ws);
    await db.from("agent_policies").delete().eq("workspace_id", ws);
    await db.from("audit_events").delete().eq("workspace_id", ws);
    await db.from("workspaces").delete().eq("id", ws);
    await cleanup();
  });
  test("a run past its working-time limit stops with a plain reason; time waiting for a person does not count", async () => {
    const runtime = load<{ executeRun: (d: unknown, r: Record<string, unknown>) => Promise<void> }>("src/lib/agent/runtime.ts", {
      "server-only": {}, "node:crypto": nodeCrypto, "@/lib/supabase/admin": { createAdminClient: () => admin }, "@/lib/workspace/db": { untyped: (x: unknown) => x },
      "./locale": { localeDirective: () => "" }, "@/lib/i18n/workspace": { workspaceLocale: () => ({ timezone: "Europe/London", currency: "GBP" }) },
      "./llm": { chat: async () => { throw new Error("no model in this test"); }, agentConfigured: () => false, SAFETY: "S", dataBlock: prompt.dataBlock, AgentBudgetError, AgentSafetyError },
      "./resilience": resilience, "@/lib/media/document": { PRESETS: [], posterFromEvent: () => ({}) }, "./watch": watch, "./registry": registry, "./minimise": minimiseMod,
      "./plan": plan, "./skills": skills, "./schedule-db": { routineNextRun: async () => null },
    });
    await db.from("agent_policies").upsert({ workspace_id: ws, mode: "execute_with_approval", max_run_minutes: 5, kill_switch: false });
    const lease = new Date(Date.now() + 15 * 60_000).toISOString();
    const mk = async (createdAgoMin: number, humanWaitS: number) => {
      const { data, error } = await db.from("agent_runs").insert({ workspace_id: ws, user_id: owner.id, surface: "organizer", mode: "do", goal: "Q75 time limit", status: "paused", plan: [], lease_until: lease,
        idempotency_key: `q75-${nodeCrypto.randomBytes(4).toString("hex")}` }).select("id").single();
      if (error) throw new Error(error.message);
      await db.from("agent_run_steps").insert({ run_id: data!.id, seq: 1, tool_id: "event.readiness", input: {}, reason: "q75", idempotency_key: `${data!.id}:1` });
      await db.from("agent_runs").update({ created_at: new Date(Date.now() - createdAgoMin * 60_000).toISOString(), wait_human_s: humanWaitS }).eq("id", data!.id);
      await db.from("agent_runs").update({ status: "queued", lease_until: lease }).eq("id", data!.id);   // leaving "paused" closes the open wait
      return (await db.from("agent_runs").select("*").eq("id", data!.id).single()).data as Record<string, unknown>;
    };
    const over = await mk(30, 0);
    await runtime.executeRun(db, over);
    const r1 = (await db.from("agent_runs").select("status,summary").eq("id", over.id as string).single()).data!;
    expect(r1.status).toBe("failed"); expect(String(r1.summary)).toMatch(/5-minute working-time limit/);
    const { data: steps } = await db.from("agent_run_steps").select("status").eq("run_id", over.id as string);
    expect(steps!.map(s => s.status)).toEqual(["pending"]);   // nothing executed
    const waited = await mk(30, 29 * 60);                     // 29 of the 30 minutes were spent waiting for a person
    const { data: lim } = await db.rpc("agent_run_time_check" as never, { p_run: waited.id } as never);
    expect((lim as { exceeded: string | null }).exceeded).toBeNull();
  });
});
