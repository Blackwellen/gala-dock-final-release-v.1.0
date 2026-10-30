// Q24: sponsors, sponsorship / exhibitor packages, booths, talent (with riders) on Neon Nights (festival) and Global Tech
// Conference (speakers, exhibitors). Uses package_save / party_save / party_transition / booth_save / booth_allocate /
// rider_submit / rider_decide as the organiser. talent_profiles has no command (workspace directory data) — direct insert.
import { block } from "./lib.mjs";

const OWNER = "alex.events@example.com";
const q = s => s.replace(/'/g, "''");

const EVENTS = {
  "neon-nights": {
    packages: [["sponsorship", "Headline Partner", "Platinum", 25000, 1, "Main stage naming, 20 VIP passes, LED screen idents"], ["sponsorship", "Bar Partner", "Gold", 9500, 2, "Bar branding and product placement"],
               ["exhibitor", "Street-food pitch", "Standard", 850, 12, "3×3 m pitch, 16 A power, water access"]],
    parties: [["sponsor", "Headline Partner", "Volt Energy Drinks", 25000, "confirmed", "Hannah Reeve", "partnerships@volt-energy.example.com"],
              ["sponsor", "Bar Partner", "Thames Brewing Co.", 9500, "confirmed", "Oli Grant", "events@thamesbrewing.example.com"],
              ["exhibitor", "Street-food pitch", "Bao Down Kitchen", 850, "confirmed", "Lily Chen", "hello@baodown.example.com"],
              ["exhibitor", "Street-food pitch", "Smoke & Sons BBQ", 850, "negotiating", "Ray Sutton", "ray@smokeandsons.example.com"],
              ["artist", null, "KORA (live)", 6500, "confirmed", "Mo Agent — Pulse Artists", "bookings@pulseartists.example.com"],
              ["artist", null, "Nightjar b2b Halcyon", 3200, "confirmed", "Sam Rowe — Halo Mgmt", "sam@halomgmt.example.com"]],
    booths: [["F01", "Food court 1"], ["F02", "Food court 2"], ["F03", "Food court 3"], ["F04", "Food court 4"]],
    talent: [["KORA", "band", "Afro-house live band"], ["Nightjar b2b Halcyon", "dj", "Melodic techno back-to-back set"]],
  },
  "global-tech-conference": {
    packages: [["sponsorship", "Gold Sponsor", "Gold", 15000, 3, "Keynote slot mention, booth, 10 delegate passes"], ["exhibitor", "Expo booth 3×2", "Standard", 2400, 30, "Shell scheme, 2 chairs, power, Wi-Fi"]],
    parties: [["sponsor", "Gold Sponsor", "Nimbus Cloud", 15000, "confirmed", "Ravi Patel", "events@nimbus.example.com"],
              ["exhibitor", "Expo booth 3×2", "Lattice Data", 2400, "confirmed", "Emma Lowe", "emma@lattice.example.com"],
              ["exhibitor", "Expo booth 3×2", "Quill Security", 2400, "prospect", "Ben Ito", "ben@quillsec.example.com"],
              ["speaker", null, "Dr Amara Okoye", 0, "confirmed", "Amara Okoye", "amara.okoye@example.com"],
              ["speaker", null, "Jonas Weber", 1500, "confirmed", "Jonas Weber", "jonas.weber@example.com"]],
    booths: [["A01", "Expo hall A01"], ["A02", "Expo hall A02"], ["A03", "Expo hall A03"]],
    talent: [["Dr Amara Okoye", "speaker", "AI ethics researcher, UCL"], ["Jonas Weber", "speaker", "CTO, Fernway"]],
  },
};

export async function run() {
  const body = Object.entries(EVENTS).map(([slug, d]) => `
  v := pg_temp._ev('${slug}');
  if v is not null then
    perform pg_temp._as('${OWNER}');
    ${d.talent.map(([n, k, bio]) => `
    insert into public.talent_profiles(workspace_id, kind, name, bio, status, created_by)
      select e.workspace_id, '${k}', '${q(n)}', '${q(bio)}', 'active', pg_temp._uid('${OWNER}') from public.events e
      where e.id = v and not exists (select 1 from public.talent_profiles t where t.workspace_id = e.workspace_id and t.name = '${q(n)}');
    get diagnostics n = row_count; perform pg_temp._n('talent_profiles', n);`).join("")}
    ${d.packages.map(([k, name, tier, price, qty, desc]) => `
    if not exists (select 1 from public.event_party_packages where event_id = v and name = '${q(name)}') then
      perform public.package_save(v, jsonb_build_object('kind', '${k}', 'name', '${q(name)}', 'tier', '${tier}', 'description', '${q(desc)}', 'price', ${price}, 'currency', 'GBP', 'quantity', ${qty}, 'status', 'active',
        'benefits', case when '${k}' = 'sponsorship' then jsonb_build_array(jsonb_build_object('kind', 'logo_placement', 'title', 'Logo on site signage and screens', 'quantity', 1, 'owed_by', 'organizer', 'due_days_before', 7),
          jsonb_build_object('kind', 'passes', 'title', 'Partner VIP passes', 'quantity', 10, 'pass_type', 'vip', 'owed_by', 'organizer', 'due_days_before', 3),
          jsonb_build_object('kind', 'asset', 'title', 'Vector logo and brand guidelines', 'quantity', 1, 'owed_by', 'party', 'due_days_before', 21, 'evidence_required', true))
        else jsonb_build_array(jsonb_build_object('kind', 'booth', 'title', '${q(desc)}', 'quantity', 1, 'owed_by', 'organizer')) end), null);
      perform pg_temp._n('packages');
    end if;`).join("")}
    ${d.parties.map(([k, pkg, name, fee, status, contact, email]) => `
    if not exists (select 1 from public.event_parties where event_id = v and name = '${q(name)}') then
      r := public.party_save(v, jsonb_build_object('kind', '${k}', 'name', '${q(name)}', 'fee', ${fee}, 'currency', 'GBP', 'contact_name', '${q(contact)}', 'contact_email', '${email}',
        'arrival_buffer_minutes', 90, 'notes', 'Demo partner (Q38).'
        ${pkg ? `, 'package_id', (select id from public.event_party_packages where event_id = v and name = '${q(pkg)}')` : ""}
        ${["artist", "speaker"].includes(k) ? `, 'talent_profile_id', (select t.id from public.talent_profiles t join public.events e on e.workspace_id = t.workspace_id where e.id = v and t.name = '${q(name)}' limit 1)` : ""}), null, null);
      v2 := (select id from public.event_parties where event_id = v and name = '${q(name)}');
      ${status === "prospect" ? "" : `perform public.party_transition(v2, 'negotiating', 'Terms sent');`}
      ${status === "confirmed" ? `perform public.party_transition(v2, 'confirmed', 'Signed and confirmed');` : ""}
      perform pg_temp._n('parties');
    end if;`).join("")}
    ${d.booths.map(([code, name]) => `
    if not exists (select 1 from public.exhibitor_booths where event_id = v and code = '${code}') then
      perform public.booth_save(v, jsonb_build_object('code', '${code}', 'name', '${q(name)}', 'width_m', 3, 'depth_m', ${slug === "neon-nights" ? 3 : 2}, 'power_kw', ${slug === "neon-nights" ? 3.7 : 1}, 'price', ${slug === "neon-nights" ? 850 : 2400}, 'currency', 'GBP',
        'features', jsonb_build_array('power', 'lighting'), 'status', 'available'), null);
      perform pg_temp._n('booths');
    end if;`).join("")}
    -- allocate confirmed exhibitors to the first free booths
    for v2 in select p.id from public.event_parties p where p.event_id = v and p.kind = 'exhibitor' and p.status = 'confirmed'
        and not exists (select 1 from public.exhibitor_booths b where b.party_id = p.id) order by p.created_at loop
      perform public.booth_allocate((select b.id from public.exhibitor_booths b where b.event_id = v and b.status = 'available' order by b.code limit 1), v2, false);
      perform pg_temp._n('booth_allocations');
    end loop;
    -- riders: technical + hospitality for each confirmed talent party, accepted by the organiser
    for v2 in select p.id from public.event_parties p where p.event_id = v and p.kind in ('artist','speaker') and p.status = 'confirmed'
        and not exists (select 1 from public.talent_riders r2 where r2.party_id = p.id) loop
      r := public.rider_submit(v2, 'technical', 'Stage plot and input list attached; arrival 3 h before set.', jsonb_build_array(
        jsonb_build_object('category', 'audio', 'description', 'DI boxes and 4 vocal mics (SM58)', 'quantity', 4, 'required', true),
        jsonb_build_object('category', 'lighting', 'description', 'Haze allowed; no strobes during spoken intro', 'quantity', 1, 'required', false),
        jsonb_build_object('category', 'backline', 'description', 'CDJ-3000 ×3 and DJM-V10 mixer', 'quantity', 1, 'required', true)));
      perform public.rider_decide((select id from public.talent_riders where party_id = v2 order by version desc limit 1), 'accepted', 'All items can be provided.');
      r := public.rider_submit(v2, 'hospitality', 'Dressing room for 4, hot meal, still water.', jsonb_build_array(
        jsonb_build_object('category', 'dressing_room', 'description', 'Private dressing room with mirror and rail', 'quantity', 1, 'required', true),
        jsonb_build_object('category', 'catering', 'description', 'Hot vegetarian meal for 4', 'quantity', 4, 'required', true),
        jsonb_build_object('category', 'drinks', 'description', 'Still water 24 × 500 ml', 'quantity', 24, 'required', true)));
      perform pg_temp._n('riders', 2);
    end loop;
  end if;`).join("\n");
  return block(body);
}
