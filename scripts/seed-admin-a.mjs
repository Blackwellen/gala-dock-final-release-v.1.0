// Seeds the Platform Admin AD-001..AD-009 design scenario: organizer workspaces, their ticketed events
// (tiers, tickets, orders, scans) and identity details for the directory users that already exist.
// Idempotent: records are keyed by name + settings.seed = 'admin-a' and never duplicated; ticket rows are only
// generated for seeded events that have none. Runs through the Supabase Management API (scripts only).
// Usage: node --env-file=.env --env-file=.env.local scripts/seed-admin-a.mjs
const ref = process.env.SUPABASE_PROJECT_REF, pat = process.env.SUPABASE_PAT_KEY;
if (!ref || !pat) { console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_PAT_KEY."); process.exit(1); }

async function sql(query, attempt = 0) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(180_000),
  });
  const text = await r.text();
  // The Management API throttles bursts and other sessions may hold locks: back off and retry.
  if ((r.status === 429 || /deadlock detected/.test(text)) && attempt < 8) {
    await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
    return sql(query, attempt + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text}`);
  return JSON.parse(text);
}
const q = s => `'${String(s).replaceAll("'", "''")}'`;

// ── Identity details for existing directory users (by email) ──
const people = [
  ["s.mitchell@example.com", { phone: "+44 7700 900123", dob: "1992-03-14", hours: 2, verified: true }],
  ["james.carter@example.com", { phone: "+44 7700 900456", dob: "1988-07-02", hours: 5, verified: true, avatar: "/assets/gd/av-james-carter.webp" }],
  ["p.shah@example.com", { phone: "+44 7700 900789", dob: "1990-11-21", hours: 26 }],
  ["m.lee@example.com", { phone: "+44 7700 900321", dob: "1986-01-30", hours: 3 }],
  ["d.kim@example.com", { phone: "+44 7700 900654", dob: "1995-05-18", hours: 50 }],
  ["support.demo@example.com", { hours: 4 }],
  ["o.bennett@example.com", { phone: "+44 7700 900987", dob: "1983-09-09", hours: 24 }],
  ["e.carter@example.com", { phone: "+44 7700 900111", dob: "1997-02-11", hours: 144 }],
  ["l.wilson@example.com", { phone: "+44 7700 900222", dob: "1991-12-05", hours: 5 }],
  ["s.turner@example.com", { phone: "+44 7700 900333", dob: "1993-06-27", hours: 25 }],
];
for (const [email, p] of people) {
  await sql(`update public.profiles set
    ${p.phone ? `phone = coalesce(nullif(phone, ''), ${q(p.phone)}),` : ""}
    ${p.dob ? `date_of_birth = coalesce(date_of_birth, ${q(p.dob)}::date),` : ""}
    ${p.verified ? "identity_verified = true," : ""}
    ${p.avatar ? `avatar_url = case when avatar_url = '' then ${q(p.avatar)} else avatar_url end,` : ""}
    home_area = case when coalesce(home_area, '') = '' then 'London, UK' else home_area end,
    country = coalesce(nullif(country, ''), 'GB'), language = coalesce(nullif(language, ''), 'English'),
    last_active_at = now() - interval '${p.hours} hours'
    where id = (select id from auth.users where email = ${q(email)})`);
}
console.log("profiles updated");

// ── Organizer workspaces ──
const workspaces = [
  // name, owner email, plan, verification, commission bps, cover, created, reference, company, company no, city
  ["Riverside Events", "s.mitchell@example.com", "pro", "verified", 1000, "v-riverside-events-centre", "2024-01-12", "ORG-1001", "Riverside Events Ltd", "14235678", "London, UK"],
  ["London Events Co", "james.carter@example.com", "business", "verified", 1200, "v-grand-hall", "2024-02-03", "ORG-1002", "London Events Co Ltd", "13987421", "London, UK"],
  ["Elite Events UK", "p.shah@example.com", "pro", "pending", 1200, "v-harper", "2024-03-18", "ORG-1003", "Elite Events UK Ltd", "15022874", "Manchester, UK"],
  ["City Nights", "d.kim@example.com", "business", "verified", 1000, "v-pulse", "2024-04-09", "ORG-1004", "City Nights Entertainment Ltd", "14877102", "London, UK"],
  ["Summer Fest Ltd", "support.demo@example.com", "enterprise", "verified", 800, "oe-community-fair", "2024-05-21", "ORG-1005", "Summer Fest Ltd", "12763309", "Bristol, UK"],
  ["The Venue Group", "m.lee@example.com", "pro", "verified", 1200, "v-oakwood", "2024-06-14", "ORG-1006", "The Venue Group Ltd", "15530291", "Leeds, UK"],
  ["Urban Events", "o.bennett@example.com", "starter", "unverified", 1500, "rv-urban-events", "2024-08-02", "ORG-1007", "Urban Events Ltd", "", "London, UK"],
  ["Festival Collective", "e.carter@example.com", "business", "verified", 1000, "oe-sunset", "2024-09-27", "ORG-1008", "Festival Collective CIC", "13300478", "Brighton, UK"],
  ["Global Events", "l.wilson@example.com", "pro", "verified", 1200, "oe-global-tech", "2024-11-05", "ORG-1009", "Global Events Group Ltd", "14019956", "Oxford, UK"],
  ["Moments & More", "s.turner@example.com", "business", "pending", 1200, "b-moments", "2025-01-16", "ORG-1010", "Moments & More Ltd", "15877340", "Birmingham, UK"],
];
for (const [name, email, plan, ver, bps, cover, created, refn, company, no, city] of workspaces) {
  await sql(`insert into public.workspaces(owner_id, name, kind, plan, verification_status, commission_bps, cover_image, created_at, onboarding_complete, onboarding_step, payout_status, settings)
    select u.id, ${q(name)}, 'organizer', ${q(plan)}, ${q(ver)}, ${bps}, '/assets/gd/${cover}.webp', ${q(created)}::timestamptz, true, 'done',
      ${ver === "verified" ? "'active'" : "'pending'"},
      jsonb_build_object('seed', 'admin-a', 'reference', ${q(refn)}, 'company', ${q(company)}, 'company_no', ${q(no)}, 'vat_number', ${q(no ? `GB${no}9` : "")}, 'location', ${q(city)})
    from auth.users u where u.email = ${q(email)}
      and not exists(select 1 from public.workspaces w where w.name = ${q(name)} and w.settings->>'seed' = 'admin-a')`);
}
// Team for Riverside Events (owner row comes from the workspace trigger).
await sql(`insert into public.workspace_members(workspace_id, user_id, role, status, created_at)
  select w.id, u.id, r.role, 'active', w.created_at + r.after from public.workspaces w
  join (values ('james.carter@example.com','manager', interval '10 days'), ('p.shah@example.com','finance', interval '40 days'), ('d.kim@example.com','member', interval '90 days')) r(email, role, after) on true
  join auth.users u on u.email = r.email
  where w.name = 'Riverside Events' and w.settings->>'seed' = 'admin-a'
  on conflict (workspace_id, user_id) do nothing`);
console.log("workspaces ready");

// ── Ticketed events ──
// name, workspace, type, status, visibility, start (London), end (London), venue, city, cover, reference, featured, tiers [name, kind, price, qty, sold]
// Upcoming public events use the "ready" lifecycle state so the scenario does not alter customer discovery feeds.
const events = [
  ["Charity Ball", "Global Events", "gala", "completed", "public", "2026-02-20 18:00", "2026-02-21 01:00", "Randolph Hotel", "Oxford", "type-private-dinner", "EVT-5632", false, [["General Admission", "general", 55, 800, 740]]],
  ["Comedy Night", "City Nights", "comedy", "ready", "public", "2026-12-12 19:30", "2026-12-12 23:00", "Laugh Lounge", "London", "ev-comedy", "EVT-5710", false, [["General Admission", "general", 30, 1000, 920]]],
  ["Local Makers Market", "Festival Collective", "community", "ready", "public", "2026-11-03 10:00", "2026-11-03 16:00", "Brighton Dome", "Brighton", "oe-community-fair", "EVT-5821", false, [["General Admission", "general", 30, 1200, 1120]]],
  ["Brand Launch Event", "London Events Co", "corporate", "cancelled", "private", "2026-09-18 18:00", "2026-09-18 23:00", "West End Rooms", "London", "type-corporate", "EVT-5980", false, [["General Admission", "general", 40, 300, 0]]],
  ["Wedding Showcase", "The Venue Group", "wedding", "completed", "public", "2026-03-06 11:00", "2026-03-06 17:00", "Grand Hall Venue", "Leeds", "hero-wedding", "EVT-6230", false, [["General Admission", "general", 35, 800, 680]]],
  ["Children's Disco", "Moments & More", "family", "draft", "private", "2026-10-28 14:00", "2026-10-28 17:00", "Happy Kids Hall", "Birmingham", "type-childrens-party", "EVT-6412", false, [["General Admission", "general", 10, 500, 0]]],
  ["City Beats", "Riverside Events", "concert", "completed", "public", "2026-04-12 19:00", "2026-04-12 23:00", "Riverside Arena", "London", "sv-neon", "EVT-6455", false, [["General Admission", "general", 20, 800, 600]]],
  ["NYE Gala", "Riverside Events", "gala", "completed", "public", "2025-12-31 20:00", "2026-01-01 04:00", "Elite Hall", "Manchester", "oe-music-awards", "EVT-6520", false, [["General Admission", "general", 70, 2500, 2400], ["VIP", "vip", 100, 500, 460]]],
  ["Jazz Nights", "Riverside Events", "concert", "completed", "public", "2026-05-10 19:00", "2026-05-10 23:00", "The London Loft", "London", "sv-loft", "EVT-6981", false, [["Standard", "general", 30, 420, 420]]],
  ["Summer Food Festival", "Riverside Events", "festival", "completed", "public", "2026-08-22 12:00", "2026-08-22 22:00", "Victoria Park", "Bristol", "ev-tastetango", "EVT-7710", false, [["General Admission", "general", 30, 4000, 3100], ["VIP", "vip", 50, 1000, 720]]],
  ["Tech Summit After Party", "Riverside Events", "corporate", "ready", "public", "2026-11-14 18:00", "2026-11-15 00:00", "Riverside Arena", "London", "hero-neon", "EVT-7842", true, [["General Admission", "general", 65, 1200, 1040], ["VIP", "vip", 92, 300, 200]]],
];
const london = s => `(${q(s)}::timestamp at time zone 'Europe/London')`;
for (const [i, [name, ws, type, status, vis, start, end, venue, city, cover, refn, featured, tiers]] of events.entries()) {
  const desc = `${name} — a ${type.replace("_", " ")} event at ${venue}, ${city}.`;
  await sql(`insert into public.events(owner_id, workspace_id, management, name, slug, event_type, visibility, status, starts_at, ends_at, venue_name, location, city, capacity, cover_image, description, created_at, settings)
    select w.owner_id, w.id, 'professional', ${q(name)}, ${q(name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + refn.toLowerCase())}, ${q(type)}, ${q(vis)}, ${q(status)},
      ${london(start)}, ${london(end)}, ${q(venue)}, ${q(`${venue}, ${city}, UK`)}, ${q(city)}, ${tiers.reduce((a, t) => a + t[3], 0)}, '/assets/gd/${cover}.webp', ${q(desc)},
      least(${london(start)} - interval '75 days', now() - interval '${60 - i} days'), jsonb_build_object('seed', 'admin-a', 'reference', ${q(refn)}, 'featured', ${featured})
    from public.workspaces w where w.name = ${q(ws)} and w.settings->>'seed' = 'admin-a'
      and not exists(select 1 from public.events e where e.name = ${q(name)} and e.settings->>'seed' = 'admin-a')`);
  for (const [k, [tname, kind, price, qty]] of tiers.entries()) {
    await sql(`insert into public.ticket_tiers(event_id, name, kind, price, quantity, sold, status, sort)
      select e.id, ${q(tname)}, ${q(kind)}, ${price}, ${qty}, 0, ${status === "draft" ? "'draft'" : status === "cancelled" ? "'hidden'" : "'on_sale'"}, ${k}
      from public.events e where e.name = ${q(name)} and e.settings->>'seed' = 'admin-a'
        and not exists(select 1 from public.ticket_tiers t where t.event_id = e.id and t.name = ${q(tname)})`);
  }
}
console.log("events + tiers ready");

// Bulk tickets: only for seeded events without tickets. Orders of 1–4 tickets, buyer names from a fixed list,
// sales spread before the event (or over the last 45 days for upcoming ones). Past events: ~88% scanned.
const firsts = ["Olivia", "Amelia", "Isla", "Ava", "Mia", "Freya", "Lily", "Grace", "Noah", "Oliver", "George", "Arthur", "Leo", "Harry", "Oscar", "Jack", "Charlie", "Jacob", "Ella", "Ruby", "Sophie", "Ethan", "Zara", "Aisha", "Ravi", "Hannah", "Tom", "Megan", "Chloe", "Ben"];
const lasts = ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Patel", "Robinson", "Wright", "Thompson", "Evans", "Walker", "White", "Roberts", "Green", "Hall", "Wood", "Clarke", "Khan", "Hughes", "Turner", "Lewis"];
for (const [name, , , status, , , , , , , refn, , tiers] of events) {
  for (const [tname, , price, , sold] of tiers) {
    if (!sold) continue;
    const upcoming = status === "ready";
    await sql(`with e as (select ev.id, ev.starts_at, t.id tier from public.events ev join public.ticket_tiers t on t.event_id = ev.id and t.name = ${q(tname)}
        where ev.name = ${q(name)} and ev.settings->>'seed' = 'admin-a' and not exists(select 1 from public.tickets x where x.tier_id = t.id)),
      f as (select array[${firsts.map(q).join(",")}] fn, array[${lasts.map(q).join(",")}] ln),
      g as (select i, (i / 3) o from generate_series(0, ${sold - 1}) i)
      insert into public.tickets(code, event_id, tier_id, attendee_name, attendee_email, order_ref, status, price_paid, created_at, checked_in_at)
      select ${q(refn)} || '-' || upper(substr(md5(e.tier::text || g.i), 1, 8)), e.id, e.tier,
        f.fn[1 + (g.o * 7) % ${firsts.length}] || ' ' || f.ln[1 + (g.o * 11) % ${lasts.length}],
        lower(f.fn[1 + (g.o * 7) % ${firsts.length}] || '.' || f.ln[1 + (g.o * 11) % ${lasts.length}]) || (g.o % 97) || '@example.com',
        'BK-' || upper(substr(md5(e.id::text || g.o), 1, 6)),
        ${upcoming ? "'valid'" : "case when (g.i * 13) % 100 < 88 then 'used' else 'valid' end"}, ${price},
        ${upcoming ? `now() - make_interval(mins => ((${sold} - g.i) * 45 * 24 * 60 / ${sold})::int)` : `e.starts_at - make_interval(mins => ((${sold} - g.i) * 60 * 24 * 60 / ${sold})::int + 60)`},
        ${upcoming ? "null" : "case when (g.i * 13) % 100 < 88 then e.starts_at + make_interval(mins => (g.i % 120)) end"}
      from e, f, g`);
  }
}
// Named recent orders for the Tech Summit drawer and refunds on two events.
await sql(`with e as (select ev.id, t.id tier, t.price from public.events ev join public.ticket_tiers t on t.event_id = ev.id and t.name = 'General Admission'
    where ev.name = 'Tech Summit After Party' and ev.settings->>'seed' = 'admin-a'),
  o(ref, buyer, n, mins, st) as (values ('BK-7842','Alex Turner',4,35,'valid'), ('BK-7819','Priya Shah',2,95,'valid'), ('BK-7801','Daniel Kim',6,180,'valid'), ('BK-7794','Rachel Adams',2,260,'refunded'), ('BK-7771','Marcus Lee',8,400,'valid'))
  insert into public.tickets(code, event_id, tier_id, attendee_name, attendee_email, order_ref, status, price_paid, created_at)
  select 'EVT-7842-' || o.ref || '-' || s, e.id, e.tier, o.buyer, lower(replace(o.buyer, ' ', '.')) || '@example.com', o.ref, o.st, e.price, now() - make_interval(mins => o.mins)
  from e cross join o cross join generate_series(1, o.n) s
  where not exists(select 1 from public.tickets x where x.order_ref = o.ref and x.event_id = e.id)`);
await sql(`update public.tickets t set status = 'refunded', checked_in_at = null from public.events e
  where t.event_id = e.id and e.settings->>'seed' = 'admin-a' and e.name in ('Summer Food Festival', 'NYE Gala', 'Comedy Night') and t.status in ('valid','used')
    and ('x' || substr(md5(t.id::text), 1, 4))::bit(16)::int % 100 < 2
    and not exists(select 1 from public.tickets r where r.event_id = e.id and r.status = 'refunded')`);
// Sarah Mitchell's own tickets (profile scenario): 5 orders, 12 tickets, 8 scanned, 1 refunded order.
await sql(`with u as (select id from auth.users where email = 's.mitchell@example.com'),
  o(ref, ev, tier, n, at_, st) as (values
    ('BK-7861','Tech Summit After Party','General Admission',2,'2026-09-12 14:10','valid'), ('BK-7712','Summer Food Festival','General Admission',3,'2026-07-10 09:32','used'),
    ('BK-6984','Jazz Nights','Standard',3,'2026-04-22 19:05','used'), ('BK-6522','NYE Gala','General Admission',2,'2025-12-14 11:40','used'),
    ('BK-6405','City Beats','General Admission',2,'2026-03-20 08:15','refunded'))
  insert into public.tickets(code, event_id, tier_id, holder_id, attendee_name, attendee_email, order_ref, status, price_paid, created_at, checked_in_at)
  select 'SM-' || o.ref || '-' || s, e.id, t.id, u.id, 'Sarah Mitchell', 's.mitchell@example.com', o.ref, o.st, t.price, (o.at_::timestamp at time zone 'Europe/London'),
    case when o.st = 'used' then e.starts_at + interval '25 minutes' end
  from o join public.events e on e.name = o.ev and e.settings->>'seed' = 'admin-a' join public.ticket_tiers t on t.event_id = e.id and t.name = o.tier
  cross join u cross join generate_series(1, o.n) s
  where not exists(select 1 from public.tickets x where x.order_ref = o.ref and x.holder_id = u.id)`);
// Never oversell: trim generated (guest, unscanned) tickets that push a tier over its quantity.
await sql(`delete from public.tickets t using (
    select x.id, row_number() over (partition by x.tier_id order by x.created_at) rn, tt.quantity,
      (select count(*) from public.tickets y where y.tier_id = x.tier_id and y.status not in ('refunded','cancelled')) live
    from public.tickets x join public.ticket_tiers tt on tt.id = x.tier_id join public.events e on e.id = x.event_id
    where e.settings->>'seed' = 'admin-a' and x.holder_id is null and x.checked_in_at is null and x.status = 'valid' and x.order_ref not like 'BK-7%') d
  where t.id = d.id and d.live > d.quantity and d.rn <= d.live - d.quantity`);
// Tier counters follow the ticket rows; door scans follow checked-in tickets plus a few duplicate/invalid scans.
await sql(`update public.ticket_tiers t set sold = least(t.quantity, (select count(*) from public.tickets x where x.tier_id = t.id and x.status not in ('refunded','cancelled')))
  from public.events e where e.id = t.event_id and e.settings->>'seed' = 'admin-a'`);
await sql(`update public.ticket_tiers t set status = 'sold_out' from public.events e where e.id = t.event_id and e.settings->>'seed' = 'admin-a' and t.status = 'on_sale' and t.sold >= t.quantity`);
await sql(`insert into public.check_ins(ticket_id, event_id, result, created_at)
  select t.id, t.event_id, 'admitted', t.checked_in_at
  from public.tickets t join public.events e on e.id = t.event_id
  where e.settings->>'seed' = 'admin-a' and t.status = 'used' and t.checked_in_at is not null and not exists(select 1 from public.check_ins c where c.ticket_id = t.id)`);
await sql(`insert into public.check_ins(ticket_id, event_id, result, created_at)
  select t.id, t.event_id, case when row_number() over (order by t.id) % 3 = 0 then 'invalid' else 'duplicate' end, t.checked_in_at + interval '9 minutes'
  from (select t.* from public.tickets t join public.events e on e.id = t.event_id where e.name in ('Summer Food Festival','NYE Gala') and e.settings->>'seed' = 'admin-a' and t.status = 'used' order by t.id limit 20) t
  where not exists(select 1 from public.check_ins c join public.events e2 on e2.id = c.event_id where c.result <> 'admitted' and e2.settings->>'seed' = 'admin-a')`);
console.log("tickets, orders and scans ready");

// ── Admin note and recent activity for the profile / workspace scenario ──
await sql(`insert into public.admin_record_notes(subject_type, subject_id, body, author_id, author_name, created_at)
  select 'user', u.id, 'User reported duplicate charge. Confirmed single payment with Stripe. Issue resolved.', a.user_id, coalesce(p.full_name, 'Admin'), '2026-08-10 14:32+01'
  from auth.users u, public.platform_admins a left join public.profiles p on p.id = a.user_id
  where u.email = 's.mitchell@example.com' and a.user_id = (select id from auth.users where email = 'admin.demo@example.com')
    and not exists(select 1 from public.admin_record_notes n where n.subject_id = u.id)`);
await sql(`insert into public.audit_events(actor_id, workspace_id, event, metadata, created_at)
  select u.id, w.id, x.ev, x.meta::jsonb || jsonb_build_object('seed','admin-a'), now() - x.ago
  from auth.users u, public.workspaces w,
  (values ('auth.login', '{"location":"London, UK"}', interval '2 hours'), ('event.viewed', '{"event":"Tech Summit After Party"}', interval '3 hours'),
          ('ticket.purchased', '{"order":"BK-7861","amount":130,"event":"Tech Summit After Party"}', interval '29 days'),
          ('profile.updated', '{"fields":["phone"]}', interval '60 days'), ('event.created', '{"event":"Tech Summit After Party"}', interval '58 days'),
          ('workspace.plan_changed', '{"to":"pro"}', interval '1 day')) x(ev, meta, ago)
  where u.email = 's.mitchell@example.com' and w.name = 'Riverside Events' and w.settings->>'seed' = 'admin-a'
    and not exists(select 1 from public.audit_events a where a.actor_id = u.id and a.metadata->>'seed' = 'admin-a')`);

const summary = await sql(`select (select count(*) from public.workspaces where settings->>'seed'='admin-a') workspaces,
  (select count(*) from public.events where settings->>'seed'='admin-a') events,
  (select count(*) from public.tickets t join public.events e on e.id=t.event_id where e.settings->>'seed'='admin-a') tickets,
  (select id from public.workspaces where name='Riverside Events' and settings->>'seed'='admin-a') riverside_events_ws,
  (select id from auth.users where email='s.mitchell@example.com') sarah`);
console.log(summary[0]);
