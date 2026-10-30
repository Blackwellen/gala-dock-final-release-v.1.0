// Q18 / Q21 / W09: guests, RSVP links and answers, guest care, private guest links, access zones, passes, badge templates,
// scanner assignments, a published registration form with submissions, and historical check-ins.
//   * RSVP: set_guest_rsvp_token (as the host) with a random token whose SHA-256 is stored; the token is then used ONCE by the
//     seed to answer through guest_rsvp (the service-only RSVP command the /rsvp page calls) and discarded — never printed.
//   * Guest links: create_event_guest_link (as the host) for the customer's wedding and the children's party (W09).
//   * Zones / passes / badges / scanners: save_access_zone, issue_access_pass, save_badge_template, assign_event_scanner.
//   * Registration: publish_registration_form + submit_registration on the webinar (demo registrants on reserved domains).
//   * Check-ins on PAST demo events are historical — direct inserts (credential 'legacy', scanned by the door lead).
// Guests are fictional names; emails on reserved example domains.
import { createHash, randomBytes } from "node:crypto";
import { block } from "./lib.mjs";

const sha = s => createHash("sha256").update(s).digest("hex");
const tok = () => randomBytes(32).toString("base64url");
const ORG = "alex.events@example.com", CUSTOMER = "alex.thompson@example.com";

const JAMIE_GUESTS = [["Olivia Bennett", "Family"], ["Harry Bennett", "Family"], ["Amelia Clarke", "Family"], ["Noah Clarke", "Family"], ["Isla Morgan", "Friends"],
  ["George Patel", "Friends"], ["Ava Thompson", "Friends"], ["Leo Murphy", "Friends"], ["Freya Hughes", "Work"], ["Arthur Ward", "Work"], ["Grace Foster", "Work"],
  ["Oscar Price", "Friends"], ["Lily Evans", "Family"], ["Jack Turner", "Friends"], ["Mia Collins", "Family"], ["Charlie Edwards", "Work"]];
const KIDS = [["Ruby Shah", true], ["Theo Walsh", true], ["Poppy Grant", true], ["Arlo King", true], ["Ivy Doyle", true], ["Finn Carter", true], ["Nina Shah", false], ["Ben Walsh", false]];
const ANSWERS = ["confirmed", "confirmed", "confirmed", "declined", "confirmed", "confirmed", "pending", "confirmed", "confirmed", "declined", "confirmed", "confirmed"];
const DIET = ["Vegetarian", "", "Gluten free", "", "Vegan", "", "", "Halal", "", "", "No pork", ""];

export async function run() {
  // RSVP tokens for the customer's wedding guests (already seeded, 20) and the organiser's wedding guests (seeded below).
  const weddingTokens = Array.from({ length: 20 }, tok), jamieTokens = JAMIE_GUESTS.map(tok), linkTokens = [tok(), tok()];
  const rsvp = (slug, tokens, host) => `
  perform pg_temp._as('${host}');
  v := pg_temp._ev('${slug}'); n := 0;
  for r in select to_jsonb(g) j from (select g.id, row_number() over (order by g.invited_at nulls last, g.name, g.id) rn from public.guests g where g.event_id = v and g.plus_one_of is null and g.rsvp_token_hash is null) g loop
    exit when (r->>'rn')::int > ${tokens.length};
    t := (array[${tokens.map(x => `'${sha(x)}'`).join(",")}])[(r->>'rn')::int];
    perform public.set_guest_rsvp_token((r->>'id')::uuid, t);
    n := n + 1;
  end loop;
  perform pg_temp._n('rsvp_tokens', n);
  perform pg_temp._as(null);
  ${tokens.slice(0, ANSWERS.length).map((x, i) => ANSWERS[i] === "pending" ? "" : `
  if exists (select 1 from public.guests where rsvp_token_hash = '${sha(x)}' and rsvp_responded_at is null) then
    perform public.guest_rsvp('${sha(x)}', '${ANSWERS[i]}', '[]'::jsonb, ${ANSWERS[i] === "declined" ? "'Sorry, we are away that weekend.'" : "null"},
      ${DIET[i] ? `jsonb_build_object('dietary', '${DIET[i]}', 'allergies', '${i === 2 ? "Coeliac" : ""}')` : "null"});
    perform pg_temp._n('rsvp_answers');
  end if;`).join("")}`;

  return block(`
  -- organiser wedding: groups + guests
  perform pg_temp._as(null);
  v := pg_temp._ev('alex-jamie-wedding');
  if v is not null and not exists (select 1 from public.guests where event_id = v) then
    insert into public.guest_groups(event_id, kind, name, max_size, reserved_seats) values (v, 'group', 'Family', 60, 60), (v, 'group', 'Friends', 80, 70), (v, 'group', 'Work', 40, 30)
      on conflict do nothing;
    insert into public.guests(event_id, name, email, status, plus_one, tickets, group_name, group_id, invited_at)
      select v, x.n, lower(replace(x.n, ' ', '.')) || '@guests.example.com', 'invited', x.g <> 'Work', case when x.g <> 'Work' then 2 else 1 end, x.g,
             (select id from public.guest_groups gg where gg.event_id = v and gg.name = x.g limit 1), now() - interval '20 days'
      from (values ${JAMIE_GUESTS.map(([n, g]) => `('${n}', '${g}')`).join(",")}) x(n, g);
    get diagnostics n = row_count; perform pg_temp._n('guests', n);
  end if;
  ${rsvp("alex-taylor-wedding", weddingTokens, CUSTOMER)}
  ${rsvp("alex-jamie-wedding", jamieTokens, ORG)}

  -- children's party (customer): children with a guardian contact; care without free-text notes (minimised privacy)
  v := pg_temp._ev('little-explorers-6th');
  if v is not null and not exists (select 1 from public.guests where event_id = v) then
    insert into public.guests(event_id, name, email, status, is_child, tickets, invited_at)
      select v, x.n, case when x.c then '' else lower(replace(x.n, ' ', '.')) || '@parents.example.com' end, 'invited', x.c, 1, now() - interval '6 days'
      from (values ${KIDS.map(([n, c]) => `('${n}', ${c})`).join(",")}) x(n, c);
    get diagnostics n = row_count; perform pg_temp._n('guests', n);
    update public.guests g set guardian_id = (select id from public.guests p where p.event_id = v and p.name = 'Nina Shah') where g.event_id = v and g.name = 'Ruby Shah';
    update public.guests g set guardian_id = (select id from public.guests p where p.event_id = v and p.name = 'Ben Walsh') where g.event_id = v and g.name = 'Theo Walsh';
    insert into public.guest_care(guest_id, event_id, dietary, allergies, accessibility, access_flags)
      select g.id, v, x.d, x.a, '', '{}' from public.guests g join (values ('Ruby Shah', 'Vegetarian', 'Peanuts'), ('Arlo King', '', 'Dairy')) x(n, d, a) on x.n = g.name where g.event_id = v;
    get diagnostics n = row_count; perform pg_temp._n('guest_care', n);
  end if;

  -- private guest links (W09)
  perform pg_temp._as('${CUSTOMER}');
  v := pg_temp._ev('alex-taylor-wedding');
  if v is not null and not exists (select 1 from public.event_guest_links where event_id = v and revoked_at is null) then
    perform public.create_event_guest_link(v, '${sha(linkTokens[0])}', 'Wedding guests', (select starts_at + interval '2 days' from public.events where id = v), true, true);
    perform pg_temp._n('guest_links');
  end if;
  v := pg_temp._ev('little-explorers-6th');
  if v is not null and not exists (select 1 from public.event_guest_links where event_id = v and revoked_at is null) then
    perform public.create_event_guest_link(v, '${sha(linkTokens[1])}', 'Class invite (Year 1)', (select starts_at + interval '1 day' from public.events where id = v), true, false);
    perform pg_temp._n('guest_links');
  end if;

  -- Neon Nights: zones, passes, badge template, scanners
  perform pg_temp._as('${ORG}');
  v := pg_temp._ev('neon-nights');
  if v is not null and not exists (select 1 from public.access_zones where event_id = v) then
    perform public.save_access_zone(v, jsonb_build_object('name', 'Arena (general)', 'kind', 'general', 'capacity', 1800, 'reentry', 'limited', 'max_entries', 2, 'sort', 1, 'status', 'active'), null);
    perform public.save_access_zone(v, jsonb_build_object('name', 'VIP deck', 'kind', 'vip', 'capacity', 400, 'reentry', 'allow', 'sort', 2, 'status', 'active'), null);
    perform public.save_access_zone(v, jsonb_build_object('name', 'Backstage', 'kind', 'backstage', 'capacity', 80, 'reentry', 'allow', 'sort', 3, 'status', 'active'), null);
    perform public.save_access_zone(v, jsonb_build_object('name', 'Accessible platform', 'kind', 'accessible', 'capacity', 60, 'reentry', 'allow', 'sort', 4, 'status', 'active'), null);
    perform public.save_access_zone(v, jsonb_build_object('name', 'Production compound', 'kind', 'staff', 'capacity', 120, 'reentry', 'allow', 'sort', 5, 'status', 'active'), null);
    perform pg_temp._n('zones', 5);
  end if;
  if v is not null and not exists (select 1 from public.badge_templates where event_id = v) then
    perform public.save_badge_template(v, 'Neon crew & artist badge', jsonb_build_object('size', 'A6', 'fields', jsonb_build_array('holder_name', 'pass_type', 'zones', 'qr'),
      'colour', '#6d28d9', 'logo', true), array['artist', 'staff', 'supplier', 'press'], null);
    perform pg_temp._n('badge_templates');
  end if;
  if v is not null and not exists (select 1 from public.access_passes where event_id = v) then
    v2 := (select id from public.badge_templates where event_id = v limit 1);
    perform public.issue_access_pass(v, 'artist', 'KORA — band (6)', 'bookings@pulseartists.example.com',
      array(select id from public.access_zones where event_id = v and kind in ('backstage', 'general', 'vip')), (select starts_at - interval '8 hours' from public.events where id = v),
      (select ends_at + interval '2 hours' from public.events where id = v), null, null, null, v2);
    perform public.issue_access_pass(v, 'staff', 'Kofi Mensah (steward lead)', 'agency.staff.demo@example.com',
      array(select id from public.access_zones where event_id = v), (select starts_at - interval '10 hours' from public.events where id = v),
      (select ends_at + interval '4 hours' from public.events where id = v), null, pg_temp._uid('agency.staff.demo@example.com'), null, v2);
    perform public.issue_access_pass(v, 'press', 'Jess Rowe (Mixmag)', 'jess.rowe@press.example.com',
      array(select id from public.access_zones where event_id = v and kind in ('general', 'vip')), (select starts_at from public.events where id = v),
      (select ends_at from public.events where id = v), null, null, null, v2);
    perform pg_temp._n('passes', 3);
  end if;
  if v is not null and not exists (select 1 from public.event_scanners where event_id = v) then
    perform public.assign_event_scanner(v, pg_temp._uid('james.carter@example.com'), array(select id from public.access_zones where event_id = v and kind in ('general', 'accessible')),
      (select ends_at + interval '2 hours' from public.events where id = v));
    perform public.assign_event_scanner(v, pg_temp._uid('ops.lead.demo@example.com'), null, (select ends_at + interval '2 hours' from public.events where id = v));
    perform pg_temp._n('scanners', 2);
  end if;

  -- webinar registration form + registrations
  v := pg_temp._ev('future-of-live-events-webinar');
  if v is not null and not exists (select 1 from public.registration_forms where event_id = v) then
    perform public.publish_registration_form(v, jsonb_build_object('title', 'Register for the live briefing', 'capacity', 500, 'per_email_limit', 1, 'approval_required', false, 'waitlist', true,
      'opens_at', now() - interval '3 days', 'closes_at', (select starts_at from public.events where id = v),
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'company', 'label', 'Company', 'type', 'text', 'required', true),
        jsonb_build_object('key', 'role', 'label', 'Your role', 'type', 'select', 'required', true, 'options', jsonb_build_array('Organiser', 'Venue', 'Supplier', 'Other')),
        jsonb_build_object('key', 'captions', 'label', 'I will use live captions', 'type', 'checkbox', 'required', false))));
    perform pg_temp._n('registration_forms');
  end if;
  perform pg_temp._as(null);
  v2 := (select id from public.registration_forms where event_id = v order by created_at desc limit 1);
  if v2 is not null and not exists (select 1 from public.registrations where form_id = v2) then
    ${[["Sophie Lambert", "Festival Republic", "Organiser"], ["Daniel Okoro", "Printworks Venues", "Venue"], ["Chloe Martin", "Northern Crew Agency", "Supplier"],
       ["Ravi Shah", "Kensington Events", "Organiser"], ["Megan Doyle", "Bristol Sound Hire", "Supplier"], ["Tom Hughes", "Leeds Arena", "Venue"]].map(([n, c, role], i) => `
    perform public.submit_registration(v2, '${n}', '${n.toLowerCase().replace(" ", ".")}@registrants.example.com', jsonb_build_object('company', '${c}', 'role', '${role}', 'captions', ${i % 2 === 0}), null, 'depth-pass1-${i}');`).join("")}
    perform pg_temp._n('registrations', 6);
  end if;

  -- historical check-ins on the organiser's past events (tickets that have no scan yet)
  insert into public.check_ins(ticket_id, event_id, scanned_by, result, created_at, device, credential, gate, subject_kind, direction)
    select t.id, t.event_id, pg_temp._uid('james.carter@example.com'), 'admitted', e.starts_at + make_interval(mins => (row_number() over (partition by t.event_id order by t.id))::int * 3),
           'Door iPad 1', 'legacy', 'Main gate', 'ticket', 'in'
    from public.tickets t join public.events e on e.id = t.event_id
    where e.slug in ('summer-sessions-2026', 'food-drink-expo-2026') and t.status in ('valid', 'used')
      and not exists (select 1 from public.check_ins c where c.ticket_id = t.id);
  get diagnostics n = row_count; perform pg_temp._n('historical_check_ins', n);
  `);
}
