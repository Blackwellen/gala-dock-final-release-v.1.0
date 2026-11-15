import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { lintMigration } from "../../scripts/db/lint.mjs";
import { offPlatformHint, REPORT_REASONS } from "../../src/lib/messaging/safety";

// Q52 messaging + Q64 notifications bug hunt (Phase A, code + DB). Source and pure checks; the live block is read-only and runs
// only with the management API credentials. The behaviour itself (alerts per recipient, blocks, reports → trust case → decision,
// legacy-thread guard/mark-read/tamper policies, duplicate guard, provider preferences, email categories) is proven by the
// rolled-back exercise scripts/db/exercises/202611149631_messaging_notifications_bughunt.sql (migrate.mjs dry-run --exercise).
const src = (f: string) => readFileSync(f, "utf8");
const MIG = "supabase/migrations/202611149631_messaging_notifications_bughunt.sql";

test("migration is additive and lint-clean", () => {
  const r = lintMigration(src(MIG));
  expect(r.errors).toEqual([]);
  expect(src(MIG)).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
});

test("inbox shows the NEWEST messages with a way back to older ones, and searches message text", () => {
  const s = src("src/components/messaging/inbox.tsx");
  expect(s).not.toMatch(/order\("created_at"\)\.limit\(300\)/);
  expect(s).toMatch(/order\("created_at", \{ ascending: false \}\)\.limit\(limit \+ 1\)/);
  expect(s).toMatch(/\.reverse\(\)/);
  expect(s).toMatch(/Show earlier messages/);
  expect(s).toMatch(/\.ilike\("body", like\)/);
  expect(s).toMatch(/in\("conversation_id", all\.map/);   // search stays inside this seat's conversations
  for (const f of ["src/app/(customer)/account/inbox/page.tsx", "src/app/organizer/inbox/page.tsx", "src/app/provider/inbox/page.tsx"]) expect(src(f), f).toMatch(/q=\{typeof sp\.q === "string"/);
});

test("every message from someone else has Report, the thread has Block, and a blocked thread can't be typed into", () => {
  const s = src("src/components/messaging/inbox.tsx");
  expect(s).toMatch(/\{!own && <ReportMessageButton messageId=\{m\.id\}/);
  expect(s).toMatch(/<BlockButton type=\{cur\.counterpart_type\}/);
  expect(s).toMatch(/blocked=\{blocked \?/);
  const c = src("src/components/messaging/messaging-client.tsx");
  expect(c).toMatch(/export function ReportMessageButton/);
  expect(c).toMatch(/export function BlockButton/);
  expect(c).toMatch(/if \(blocked\) return <p className="ms-blocked"/);
  const a = src("src/lib/messaging/actions.ts");
  expect(a).toMatch(/rpc\("report_message"/);
  expect(a).toMatch(/"block_contact" : "unblock_contact"/);
  expect(a).toMatch(/blocked_by_you/);
  // Every reason is a live `message` code (the legal lane's admin_moderation_queue ranks child_safety / illegal_content first).
  expect(REPORT_REASONS.map(([k]) => k)).toEqual(["abusive_content", "scam_or_payment_diversion", "off_platform", "spam", "illegal_content", "child_safety", "personal_data", "other_policy"]);
});

test("off-platform nudge spots contact details and outside payments, not ordinary text", () => {
  expect(offPlatformHint("email me at sam@example.com")).toBe(true);
  expect(offPlatformHint("call 07700 900123 tomorrow")).toBe(true);
  expect(offPlatformHint("Can we do a bank transfer instead?")).toBe(true);
  expect(offPlatformHint("Message me on WhatsApp")).toBe(true);
  expect(offPlatformHint("We'd like 120 guests on 14 June, 7pm to 11pm.")).toBe(false);
  expect(offPlatformHint("Budget is £2,500 for the DJ")).toBe(false);
});

test("live thread marks read only while visible; drafts persist per conversation", () => {
  const c = src("src/components/messaging/messaging-client.tsx");
  expect(c).toMatch(/if \(document\.visibilityState === "visible"\) read\(\); else pending = true;/);
  expect(c).toMatch(/removeEventListener\("visibilitychange", shown\)/);
  expect(c).toMatch(/sb\.removeChannel\(ch\)/);
  expect(c).toMatch(/gd-draft:\$\{id\}/);
});

test("notification deep link opens the caller's own seat, never the counterpart's workspace", () => {
  const s = src("src/app/messages/[id]/page.tsx");
  expect(s).not.toMatch(/\.find\(p => p\.workspace_id && p\.workspaces\)/);
  expect(s).toMatch(/listWorkspaceAccess/);
  expect(s).toMatch(/rows\.some\(p => p\.workspace_id === w\.id\)/);
  expect(s).toMatch(/remember_workspace/);
});

test("legacy event threads: mark-read via RPC, no email address as a sender name, provider page clears its alert", () => {
  const m = src("src/lib/actions/messages.ts");
  expect(m).toMatch(/rpc\("mark_thread_read"/);
  expect(m).not.toMatch(/from\("messages"\)\.update/);
  expect(m).not.toMatch(/full_name \|\| user\.email \|\|/);
  expect(src("src/app/provider/messages/[id]/page.tsx")).toMatch(/eq\("link", `\/provider\/messages\/\$\{id\}`\)/);
});

test("a removed (moderated) message's attachments can no longer be downloaded", () => {
  expect(src("src/app/api/messages/[id]/files/route.ts")).toMatch(/\.eq\("conversation_id", id\)\.is\("deleted_at", null\)/);
});

test("message emails already read in the app are not sent (in-app-off alerts still are)", () => {
  const s = src("src/lib/email/send.ts");
  expect(s).toMatch(/r\.category === "messages" && r\.notification_id/);
  expect(s).toMatch(/n\?\.read_at && !n\.muted/);
});

test("bell: organiser bell is scoped to the current workspace; the phone sheet marks what is new", () => {
  expect(src("src/lib/data/context.ts").match(/or\(`workspace_id\.is\.null,workspace_id\.eq\.\$\{ws\.id\}`\)/g)?.length).toBe(2);
  expect(src("src/lib/actions/shell.ts")).toMatch(/markNotificationsRead\(workspaceId\?: string\)/);
  expect(src("src/components/organizer/shell.tsx").match(/markNotificationsRead\(workspace\.id\)/g)?.length).toBe(2);
  const n = src("src/components/pwa/mobile-nav.tsx");
  expect(n).toMatch(/fresh \? fresh\.has\(n\.id\) : n\.unread \?\? !n\.read_at/);
});

test("admin queue lists message reports and decides them through the audited RPC", () => {
  const p = src("src/app/admin/(console)/trust/message-reports/page.tsx");
  expect(p).toMatch(/permissions\.has\("trust"\)/);
  expect(p).toMatch(/from\("message_reports"/);
  expect(src("src/app/admin/(console)/trust/message-reports/actions.ts")).toMatch(/rpc\("admin_decide_message_report"/);
  expect(src("src/app/admin/(console)/trust/view.tsx")).toMatch(/\/admin\/trust\/message-reports/);
});

const REF = process.env.SUPABASE_PROJECT_REF, PAT = process.env.SUPABASE_PAT_KEY;
async function sql<T>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, read_only: true }) });
  if (!r.ok) throw new Error(`sql HTTP ${r.status}`);
  return r.json() as Promise<T[]>;
}

test("live catalogue: 202611149631 is applied (read-only)", async () => {
  test.skip(!REF || !PAT, "needs SUPABASE_PROJECT_REF + SUPABASE_PAT_KEY");
  const [row] = await sql<Record<string, unknown>>(`select
    pg_get_functiondef('public.post_message(uuid,text,jsonb,uuid)'::regprocedure) pm,
    pg_get_functiondef('public.my_conversations(uuid,integer)'::regprocedure) mc,
    pg_get_functiondef('public.mark_conversation_read(uuid)'::regprocedure) mr,
    has_function_privilege('anon', 'public.report_message(uuid,text,text,text,boolean,uuid)', 'execute') anon_report,
    has_function_privilege('authenticated', 'public.report_message(uuid,text,text,text,boolean,uuid)', 'execute') auth_report,
    has_function_privilege('anon', 'public.block_contact(text,uuid,uuid)', 'execute') anon_block,
    has_table_privilege('authenticated', 'public.message_reports', 'insert') ins_reports,
    has_table_privilege('authenticated', 'public.message_blocks', 'insert') ins_blocks,
    (select count(*) from pg_trigger where tgname in ('legacy_message_guard', 'legacy_message_notify', 'gd_notification_txn_dedupe') and not tgisinternal) trg,
    (select count(*) from pg_policies where tablename = 'messages' and policyname in ('messages_own_update', 'messages_own_delete') and permissive = 'RESTRICTIVE') pol,
    (select array_agg(code order by code)::text from public.moderation_reason_codes where active and 'message' = any(applies_to)) codes,
    (select category from public.email_category('leave_request')) leave, (select mandatory from public.email_category('trust_enforcement')) trust`);
  expect(String(row!.pm)).toMatch(/blocked_by_you/);
  expect(String(row!.pm)).not.toMatch(/prev < now\(\) - interval '10 minutes'/);
  expect(String(row!.mc)).toMatch(/sender_workspace_id is distinct from me\.workspace_id/);
  expect(String(row!.mr)).toMatch(/update public\.notifications set read_at/);
  expect(row!.anon_report).toBe(false);
  expect(row!.auth_report).toBe(true);
  expect(row!.anon_block).toBe(false);
  expect(row!.ins_reports).toBe(false);
  expect(row!.ins_blocks).toBe(false);
  expect(Number(row!.trg)).toBe(3);
  expect(Number(row!.pol)).toBe(2);
  for (const [k] of REPORT_REASONS) expect(String(row!.codes), k).toContain(k);
  expect(row!.leave).toBe("event_updates");
  expect(row!.trust).toBe(true);
});
