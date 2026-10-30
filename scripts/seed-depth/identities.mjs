// Q38 / W05 / W06: demo identities that were missing, in the existing demo pattern (reserved @example.com addresses, passwords
// generated once and kept in the git-ignored .env.local like scripts/seed-demo.mjs). Never touches existing users.
//   * ops.lead.demo@example.com      — Priya Nair, manager at Alex Events (authors safety plans; owner approves: two people)
//   * solo.supplier.demo@example.com — Mia Rossi, solo photographer: provider workspace "Mia Rossi Photography" (service), 1 listing
//   * agency.demo@example.com        — Tom Okafor, owner of "Northern Crew Agency" (service agency) with manager / staff / finance
//     logins (agency.manager.demo / agency.staff.demo / agency.finance.demo), crew linked to those users, day rates and leave.
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { block } from "./lib.mjs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
export const USERS = [
  { email: "ops.lead.demo@example.com", name: "Priya Nair", env: "DEMO_OPS_LEAD_PASSWORD" },
  { email: "solo.supplier.demo@example.com", name: "Mia Rossi", env: "DEMO_SOLO_SUPPLIER_PASSWORD" },
  { email: "agency.demo@example.com", name: "Tom Okafor", env: "DEMO_AGENCY_OWNER_PASSWORD" },
  { email: "agency.manager.demo@example.com", name: "Grace Lewis", env: "DEMO_AGENCY_MANAGER_PASSWORD" },
  { email: "agency.staff.demo@example.com", name: "Kofi Mensah", env: "DEMO_AGENCY_STAFF_PASSWORD" },
  { email: "agency.finance.demo@example.com", name: "Hannah Price", env: "DEMO_AGENCY_FINANCE_PASSWORD" },
];

async function ensureUsers() {
  const list = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (list.error) throw new Error(`listUsers: ${list.error.message}`);
  let created = 0; const newPw = {};
  for (const u of USERS) {
    if (list.data.users.some(x => x.email === u.email)) continue;
    const password = process.env[u.env] || randomBytes(12).toString("base64url") + "a1!";
    const r = await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { full_name: u.name, terms_version: "2026-10" } });
    if (r.error) throw new Error(`createUser ${u.email}: ${r.error.message}`);
    created++; if (!process.env[u.env]) newPw[u.env] = password;
  }
  if (Object.keys(newPw).length) {
    let env = await fs.readFile(".env.local", "utf8").catch(() => "");
    for (const [k, v] of Object.entries(newPw)) if (!new RegExp(`^${k}=`, "m").test(env)) env += `${env.endsWith("\n") ? "" : "\n"}${k}=${v}\n`;
    await fs.writeFile(".env.local", env);
  }
  return created;
}

export async function run() {
  const users = await ensureUsers();
  const out = await block(`
  update public.profiles p set full_name = u.name from (values ${USERS.map(u => `('${u.email}', '${u.name}')`).join(",")}) u(email, name)
    where p.id = pg_temp._uid(u.email) and coalesce(p.full_name, '') = '';
  -- Alex Events: operations lead (manager)
  v := (select id from public.workspaces where name = 'Alex Events' and owner_id = pg_temp._uid('alex.events@example.com'));
  insert into public.workspace_members(workspace_id, user_id, role) select v, pg_temp._uid('ops.lead.demo@example.com'), 'manager'
    where not exists (select 1 from public.workspace_members where workspace_id = v and user_id = pg_temp._uid('ops.lead.demo@example.com'));
  get diagnostics n = row_count; perform pg_temp._n('memberships', n);

  -- Solo supplier
  if not exists (select 1 from public.workspaces where owner_id = pg_temp._uid('solo.supplier.demo@example.com') and kind = 'provider') then
    insert into public.workspaces(owner_id, name, kind, capabilities, settings, onboarding_complete, onboarding_step, plan)
      values (pg_temp._uid('solo.supplier.demo@example.com'), 'Mia Rossi Photography', 'provider', array['service'], '{"demo_showcase": true, "solo": true}', true, 'complete', 'starter');
    perform pg_temp._n('workspaces');
  end if;
  v := (select id from public.workspaces where owner_id = pg_temp._uid('solo.supplier.demo@example.com') and kind = 'provider' limit 1);
  if not exists (select 1 from public.listings where workspace_id = v) then
    insert into public.listings(workspace_id, name, slug, kind, category, description, city, location, price_from, price_unit, capacity_min, capacity_max, published, review_status,
        response_hours, booking_mode, tags, lat, lng, details)
      values (v, 'Mia Rossi Photography', 'mia-rossi-photography', 'service', 'media',
        'Natural, documentary-style wedding and event photography across the South West. Full-day coverage, online gallery within 3 weeks, second shooter on request.',
        'Bristol', 'Clifton, Bristol BS8', 1150, 'day', 20, 250, true, 'approved', 3, 'request', array['photography','weddings','demo_showcase'], 51.4545, -2.6278,
        '{"demo_seed":"depth-pass1","coverage":"Full day","turnaround_days":21}');
    perform pg_temp._n('listings');
  end if;

  -- Agency
  if not exists (select 1 from public.workspaces where owner_id = pg_temp._uid('agency.demo@example.com') and kind = 'provider') then
    insert into public.workspaces(owner_id, name, kind, capabilities, settings, onboarding_complete, onboarding_step, plan)
      values (pg_temp._uid('agency.demo@example.com'), 'Northern Crew Agency', 'provider', array['service'], '{"demo_showcase": true, "agency": true}', true, 'complete', 'pro');
    perform pg_temp._n('workspaces');
  end if;
  v := (select id from public.workspaces where owner_id = pg_temp._uid('agency.demo@example.com') and kind = 'provider' limit 1);
  insert into public.workspace_members(workspace_id, user_id, role)
    select v, pg_temp._uid(x.e), x.r from (values ('agency.manager.demo@example.com', 'manager'), ('agency.staff.demo@example.com', 'member'), ('agency.finance.demo@example.com', 'finance')) x(e, r)
    where not exists (select 1 from public.workspace_members m where m.workspace_id = v and m.user_id = pg_temp._uid(x.e));
  get diagnostics n = row_count; perform pg_temp._n('memberships', n);
  if not exists (select 1 from public.listings where workspace_id = v) then
    insert into public.listings(workspace_id, name, slug, kind, category, description, city, location, price_from, price_unit, published, review_status, response_hours, booking_mode, tags, lat, lng, details)
      values (v, 'Northern Crew — Event Staffing', 'northern-crew-event-staffing', 'service', 'staff',
        'Stewards, bar staff, runners and production crew for festivals and arenas across the North. SIA-licensed supervisors available.',
        'Leeds', 'Holbeck, Leeds LS11', 165, 'day', true, 'approved', 2, 'request', array['staffing','crew','demo_showcase'], 53.7900, -1.5550, '{"demo_seed":"depth-pass1"}');
    perform pg_temp._n('listings');
  end if;
  insert into public.crew_members(workspace_id, user_id, name, role, member_type, email, location, skills, day_rate, status, details)
    select v, pg_temp._uid(x.e), x.n, x.role, case when x.e is null then 'crew' else 'member' end, coalesce(x.e, ''), 'Leeds', x.skills, x.rate, 'active', jsonb_build_object('certifications', x.certs, 'demo_seed', 'depth-pass1')
    from (values ('agency.manager.demo@example.com', 'Grace Lewis', 'Crew manager', array['scheduling','SIA supervisor'], 240, '["SIA Door Supervisor (exp 2028-03)","First Aid at Work"]'::jsonb),
                 ('agency.staff.demo@example.com', 'Kofi Mensah', 'Steward lead', array['stewarding','radio'], 165, '["SIA Door Supervisor (exp 2027-11)"]'::jsonb),
                 (null, 'Ellie Ward', 'Bar supervisor', array['bar','cash handling'], 150, '["Personal licence holder"]'::jsonb),
                 (null, 'Sam Hussain', 'Production runner', array['load-in','driving'], 140, '["Full UK driving licence"]'::jsonb)) x(e, n, role, skills, rate, certs)
    where not exists (select 1 from public.crew_members c where c.workspace_id = v and c.name = x.n);
  get diagnostics n = row_count; perform pg_temp._n('crew', n);
  insert into public.leave_requests(workspace_id, crew_id, kind, starts_at, ends_at, note, status, requested_by)
    select v, c.id, 'annual', date_trunc('day', now()) + interval '21 days', date_trunc('day', now()) + interval '25 days', 'Family holiday', 'pending', c.user_id
    from public.crew_members c where c.workspace_id = v and c.name = 'Kofi Mensah'
      and not exists (select 1 from public.leave_requests l where l.crew_id = c.id);
  get diagnostics n = row_count; perform pg_temp._n('leave', n);
  `);
  return { users_created: users, ...out };
}
