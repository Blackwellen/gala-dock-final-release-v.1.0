// Q63 global search isolation + behaviour probe against the shared (live) project. Read-only in effect: every check runs inside ONE
// DO block that ends by raising 'RESULT <json>', so the transaction (including the in-transaction fixture tweaks: a listing paused,
// a role downgraded) is always rolled back. Never prints secrets or row data: only check names, pass/fail and row counts.
//
// Usage: node --env-file=.env --env-file=.env.local scripts/qa/search-isolation.mjs [--out=artifacts/release/q63-search-isolation.json]
//        [--with=supabase/migrations/<file>.sql]   pre-apply check: runs the migration first in the same rolled-back transaction
//
// Seats: organiser (workspace owner + plain member), outsider organiser, customer (no workspace), provider, platform admin (aal1/aal2), anon.
import fs from "node:fs/promises";
import { withoutTxnControl } from "../db/lint.mjs";

const SQL = String.raw`
do $probe$
declare
  out jsonb := '[]'::jsonb;
  w1 uuid; a uuid; b uuid; c uuid; p uuid; wp uuid; mem uuid; adm uuid;
  ev_priv public.events; ev_pub public.events; g public.guests; ld public.leads; pr public.proposals; inv public.invoices; tk public.tickets; cl public.clients;
  lst_unpub public.listings; lst_paused public.listings;
  n integer; ok boolean; msg text; has_admin_fn boolean := to_regprocedure('public.admin_global_search(text,integer)') is not null;
begin
  -- ── fixtures (read as the migration role) ─────────────────────────────────────────────────────────────────────────────────────
  select w.id, w.owner_id into w1, a from public.workspaces w where w.kind = 'organizer' and w.status = 'active'
    and exists (select 1 from public.leads l where l.workspace_id = w.id) and exists (select 1 from public.guests gg join public.events e on e.id = gg.event_id where e.workspace_id = w.id)
    order by (select count(*) from public.leads l where l.workspace_id = w.id) desc limit 1;
  select w.owner_id into b from public.workspaces w where w.kind = 'organizer' and w.status = 'active' and w.id <> w1 and w.owner_id <> a
    and not exists (select 1 from public.workspace_members m where m.workspace_id = w1 and m.user_id = w.owner_id) limit 1;
  select pf.id into c from public.profiles pf where pf.deleted_at is null
    and not exists (select 1 from public.workspaces w where w.owner_id = pf.id) and not exists (select 1 from public.workspace_members m where m.user_id = pf.id)
    and not exists (select 1 from public.platform_admins x where x.user_id = pf.id) limit 1;
  select w.id, w.owner_id into wp, p from public.workspaces w where w.kind = 'provider' and w.status = 'active' and exists (select 1 from public.listings l where l.workspace_id = w.id) limit 1;
  select m.user_id into mem from public.workspace_members m where m.workspace_id = w1 and m.status = 'active' and m.role = 'member' and m.user_id <> a limit 1;
  select x.user_id into adm from public.platform_admins x limit 1;
  select * into ev_priv from public.events e where e.workspace_id = w1 and not public.search_event_is_public(e) and length(e.name) >= 4 limit 1;
  select * into ev_pub from public.events e where e.workspace_id = w1 and public.search_event_is_public(e) and not public.demo_hidden_for_viewer(e.workspace_id) and length(e.name) >= 4 limit 1;
  select gg.* into g from public.guests gg join public.events e on e.id = gg.event_id where e.workspace_id = w1 and length(gg.name) >= 4 limit 1;
  select * into ld from public.leads l where l.workspace_id = w1 and length(l.name) >= 4 limit 1;
  select * into pr from public.proposals x where x.workspace_id = w1 and length(x.title) >= 4 limit 1;
  select * into inv from public.invoices x where x.workspace_id = w1 and x.number is not null limit 1;
  select * into cl from public.clients x where x.workspace_id = w1 and length(x.name) >= 4 and x.status = 'active' limit 1;
  select * into tk from public.tickets t where t.holder_id is distinct from c limit 1;
  select * into lst_unpub from public.listings l where not l.published and length(l.name) >= 4 limit 1;
  select * into lst_paused from public.listings l where l.published and l.workspace_id <> wp and length(l.name) >= 4 limit 1;
  update public.listings set paused_at = now() where id = lst_paused.id;   -- rolled back with everything else

  out := out || jsonb_build_object('fixtures', jsonb_build_object('w1', w1 is not null, 'outsider', b is not null, 'customer', c is not null, 'provider', p is not null,
    'plain_member', mem is not null, 'admin', adm is not null, 'private_event', ev_priv.id is not null, 'public_event', ev_pub.id is not null, 'guest', g.id is not null,
    'lead', ld.id is not null, 'proposal', pr.id is not null, 'invoice', inv.id is not null, 'client', cl.id is not null, 'ticket', tk.id is not null,
    'unpublished_listing', lst_unpub.id is not null, 'paused_listing', lst_paused.id is not null, 'admin_fn', has_admin_fn));

  -- helper pattern: become <uid> (authenticated, aal1 unless stated), run global_search, count forbidden ids, reset.
  -- ── outsider organiser ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  select count(*) into n from public.global_search(ev_priv.name, null, 100) r where r.id = ev_priv.id;
  out := out || jsonb_build_object('check', 'outsider: other workspace private event (personal seat)', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(g.name, null, 100) r where r.id = g.id;
  out := out || jsonb_build_object('check', 'outsider: other workspace guest by name', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(coalesce(nullif(split_part(g.email, '@', 1), ''), g.name), null, 100) r where r.id = g.id;
  out := out || jsonb_build_object('check', 'outsider: other workspace guest by email', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(ld.name, null, 100) r where r.id = ld.id;
  out := out || jsonb_build_object('check', 'outsider: other workspace lead', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(coalesce(pr.title, 'zz'), null, 100) r where r.id = pr.id;
  out := out || jsonb_build_object('check', 'outsider: other workspace proposal', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(coalesce(inv.number, 'zz'), null, 100) r where r.id = inv.id;
  out := out || jsonb_build_object('check', 'outsider: other workspace invoice', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(coalesce(cl.name, 'zz'), null, 100) r where r.id = cl.id;
  out := out || jsonb_build_object('check', 'outsider: other workspace client', 'pass', n = 0, 'leaked', n);
  begin perform public.global_search('ab', w1, 10); ok := false; exception when others then ok := sqlerrm ~ 'not_authorized'; end;
  out := out || jsonb_build_object('check', 'outsider: scoping to a foreign workspace is refused', 'pass', ok);
  reset role;

  -- ── customer (no workspace) ────────────────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  select count(*) into n from public.global_search(ev_priv.name, null, 100) r where r.id = ev_priv.id;
  out := out || jsonb_build_object('check', 'customer: private/unpublished event never returned', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(g.name, null, 100) r where r.id = g.id;
  out := out || jsonb_build_object('check', 'customer: guest PII never returned', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(tk.code, null, 100) r where r.id = tk.id;
  out := out || jsonb_build_object('check', 'customer: another holder''s ticket code never returned', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(lst_unpub.name, null, 100) r where r.id = lst_unpub.id;
  out := out || jsonb_build_object('check', 'customer: unpublished listing hidden', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(lst_paused.name, null, 100) r where r.id = lst_paused.id;
  out := out || jsonb_build_object('check', 'customer: paused listing hidden', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(lst_paused.name, null, 100) r where r.kind = 'provider' and r.id = lst_paused.workspace_id
    and not exists (select 1 from public.listings l where l.workspace_id = lst_paused.workspace_id and l.id <> lst_paused.id and l.published and l.paused_at is null);
  out := out || jsonb_build_object('check', 'customer: provider with only paused listings hidden', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search('%%', null, 100) r;
  out := out || jsonb_build_object('check', 'customer: LIKE wildcards are literal (q=%%)', 'pass', n = 0, 'rows', n);
  select count(*) into n from public.global_search(ev_pub.name, null, 100) r where r.id = ev_pub.id and r.link like '/events/%';
  out := out || jsonb_build_object('check', 'customer: public on-sale event is findable (links to the public page)', 'pass', ev_pub.id is null or n = 1, 'rows', n);
  if has_admin_fn then
    begin perform public.admin_global_search('ab', 10); ok := false; exception when others then ok := sqlerrm ~ 'not_authorized'; end;
    out := out || jsonb_build_object('check', 'customer: admin search refused', 'pass', ok);
  end if;
  reset role;

  -- ── organiser owner (positive controls) + plain member ─────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  select count(*) into n from public.global_search(ev_priv.name, w1, 100) r where r.id = ev_priv.id and r.link = '/organizer/events/' || ev_priv.id;
  out := out || jsonb_build_object('check', 'organiser owner: own private event found, organiser link', 'pass', n = 1, 'rows', n);
  select count(*) into n from public.global_search(g.name, w1, 100) r where r.id = g.id;
  out := out || jsonb_build_object('check', 'organiser owner: own guest found', 'pass', n = 1, 'rows', n);
  select count(*) into n from public.global_search(coalesce(pr.title, 'zz'), w1, 100) r where r.id = pr.id and r.link = '/organizer/sales/proposals/' || pr.id;
  out := out || jsonb_build_object('check', 'organiser owner: proposal links to /organizer/sales/proposals/<id>', 'pass', pr.id is null or n = 1, 'rows', n);
  select count(*) into n from public.global_search(coalesce(cl.name, 'zz'), w1, 100) r where r.id = cl.id and r.link = '/organizer/sales/clients/' || cl.id;
  out := out || jsonb_build_object('check', 'organiser owner: client (contacts) found, links to client page', 'pass', cl.id is null or n = 1, 'rows', n);
  select count(*) into n from public.global_search(coalesce(inv.number, 'zz'), w1, 100) r where r.id = inv.id;
  out := out || jsonb_build_object('check', 'organiser owner: invoice found', 'pass', inv.id is null or n = 1, 'rows', n);
  select count(*) into n from public.global_search(left(ev_priv.name, 3), w1, 100) r where r.id = ev_priv.id;
  out := out || jsonb_build_object('check', 'organiser owner: 3-letter prefix finds the event', 'pass', n = 1, 'rows', n);
  select count(*) into n from public.global_search(overlay(ev_priv.name placing case when substr(ev_priv.name, 3, 1) = 'x' then 'y' else 'x' end from 3 for 1), w1, 100) r where r.id = ev_priv.id;
  out := out || jsonb_build_object('check', 'organiser owner: one-letter typo still finds the event', 'pass', n = 1, 'rows', n);
  select count(*) into n from (select r.id, row_number() over (order by r.score desc) rn from public.global_search(ev_priv.name, w1, 100) r) x where x.id = ev_priv.id and x.rn <= 3;
  out := out || jsonb_build_object('check', 'organiser owner: exact title ranks in the top 3', 'pass', n = 1, 'rows', n);
  reset role;
  if mem is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', mem, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
    select count(*) into n from public.global_search(coalesce(inv.number, 'zz'), w1, 100) r where r.kind = 'invoice';
    out := out || jsonb_build_object('check', 'organiser plain member: invoices (finance.read) hidden', 'pass', n = 0, 'leaked', n);
    reset role;
  end if;

  -- ── provider seat ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  select count(*) into n from public.global_search(ev_priv.name, wp, 100) r where r.id = ev_priv.id;
  out := out || jsonb_build_object('check', 'provider: organiser private event never returned', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(g.name, wp, 100) r where r.id = g.id;
  out := out || jsonb_build_object('check', 'provider: organiser guest never returned', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search(ld.name, wp, 100) r where r.id = ld.id;
  out := out || jsonb_build_object('check', 'provider: organiser lead never returned', 'pass', n = 0, 'leaked', n);
  select count(*) into n from public.global_search('ab', wp, 100) r where r.link like '/organizer/%';
  out := out || jsonb_build_object('check', 'provider: no /organizer links in the provider seat', 'pass', n = 0, 'rows', n);
  reset role;

  -- ── platform admin ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if has_admin_fn and adm is not null then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
    begin perform public.admin_global_search('ab', 10); ok := false; exception when others then ok := sqlerrm ~ 'not_authorized'; end;
    out := out || jsonb_build_object('check', 'admin at aal1: admin search refused (MFA required)', 'pass', ok);
    reset role;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
    select count(*) into n from public.admin_global_search(ev_priv.name, 40) r where r.id = ev_priv.id and r.link like '/admin/events?%';
    out := out || jsonb_build_object('check', 'admin at aal2: any event found, admin link', 'pass', n = 1, 'rows', n);
    select count(*) into n from public.admin_global_search(left(tk.code, 12), 40) r where r.kind = 'ticket' and r.link like '/admin/tickets?%';
    out := out || jsonb_build_object('check', 'admin at aal2: ticket by code found', 'pass', n >= 1, 'rows', n);
    select count(*) into n from public.admin_global_search('ab', 40) r where r.link not like '/admin%';
    out := out || jsonb_build_object('check', 'admin at aal2: every link stays in the admin console', 'pass', n = 0, 'rows', n);
    reset role;
  end if;

  -- ── anon ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true); set local role anon;
  begin perform public.global_search('ab', null, 10); ok := false; exception when others then ok := sqlstate = '42501'; end;
  out := out || jsonb_build_object('check', 'anon: global_search not executable', 'pass', ok);
  if has_admin_fn then
    begin perform public.admin_global_search('ab', 10); ok := false; exception when others then ok := sqlstate = '42501'; end;
    out := out || jsonb_build_object('check', 'anon: admin_global_search not executable', 'pass', ok);
  end if;
  reset role;

  raise exception 'RESULT %', out::text;
end $probe$;`;

const { SUPABASE_PROJECT_REF: ref, SUPABASE_PAT_KEY: pat } = process.env;
if (!ref || !pat) { console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY"); process.exit(1); }
const withFile = process.argv.find(a => a.startsWith("--with="))?.slice(7);
const pre = withFile ? withoutTxnControl((await fs.readFile(withFile, "utf8")).replace(/^﻿/, "")) + "\n;\n" : "";
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: `begin;\n${pre}${SQL}\nrollback;` }) });
const body = await res.text();
const m = /RESULT (\[.*\])/s.exec(body.replace(/\\"/g, '"'));
if (!m) { console.error(`Probe did not finish: HTTP ${res.status} ${body.slice(0, 600)}`); process.exit(1); }
const rows = JSON.parse(m[1]);
const checks = rows.filter(r => r.check);
const report = { ranAt: new Date().toISOString(), fixtures: rows.find(r => r.fixtures)?.fixtures, passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass).length, checks };
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.check}${c.leaked ? ` (leaked ${c.leaked})` : ""}${c.rows !== undefined ? ` (rows ${c.rows})` : ""}`);
console.log(`\n${report.passed} passed, ${report.failed} failed`);
const out = process.argv.find(a => a.startsWith("--out="))?.slice(6);
if (out) await fs.writeFile(out, JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.failed ? 2 : 0;
