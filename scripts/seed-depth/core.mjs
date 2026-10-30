// Q14: event briefs (save_event_brief), a dependency chain (add_event_dependency) and templates — an organiser template saved
// from Neon Nights with save_event_template, and Gala Dock PLATFORM templates (scope = 'platform', no workspace). Platform
// templates have no end-user command (they are curated by Gala Dock), so they are inserted as service data using the same
// structure snapshot save_event_template stores (event_structure_snapshot), from the demo events.
import { block } from "./lib.mjs";

const ORG = "alex.events@example.com";
const BRIEFS = {
  "neon-nights": { goals: ["Sell out 2,000 capacity by 1 December", "Grow the mailing list by 3,000"], client_needs: "Own-brand winter festival on the river with two stages.",
    scope: "Production, bars, security, stewarding, medical, ticketing and marketing.", audience: { expected: 2000, ages: "18–35", notes: "Electronic music fans across London" }, budget_min: 120000, budget_max: 150000, currency: "GBP",
    location_needs: "Riverside site with river views, close to London Bridge", venue_needs: { capacity: 2500, notes: "Licensed for 2,500, power for two stages, artist compound" },
    supplier_needs: { security: "SIA door team 1:100 + search", medical: "St John Ambulance", bars: "Cashless bars with hosted VIP" }, style: { mood: "Neon, warm winter lighting, heaters" },
    must_haves: ["Two stages", "Accessible viewing platform", "Shuttle to London Bridge"], constraints: ["Curfew 23:00", "No glass on site"], accessibility: { step_free: true, notes: "Step-free throughout; BSL at headline set" },
    success_measures: ["Sell-through ≥ 95%", "NPS ≥ 60", "Zero reportable incidents"], internal_notes: "Volt renewal depends on footfall numbers." },
  "global-tech-conference": { goals: ["900 in-person delegates", "2,000 online attendees"], client_needs: "Two-day hybrid conference on AI and infrastructure.",
    scope: "Venue, AV and streaming, catering, speaker travel, expo.", audience: { expected: 2900, notes: "Engineering leaders and CTOs" }, budget_min: 280000, budget_max: 340000, currency: "GBP",
    location_needs: "Central or east London, near Elizabeth line", venue_needs: { capacity: 1000, notes: "Main hall 1,000 theatre style + 4 breakout rooms + expo hall" },
    supplier_needs: { av: "Broadcast-quality stream with live captions", catering: "Lunch for 1,000, dietary labelling" }, style: { mood: "Clean, light, brand blue" },
    must_haves: ["Live captions", "Speaker green room", "Expo with 30 booths"], constraints: ["No single-use plastics"], accessibility: { captions: true, hearing_loop: true, notes: "Captions on every stream; hearing loop in main hall" },
    success_measures: ["≥ 85% session satisfaction", "≥ 30 exhibitor renewals"], internal_notes: "" },
};

export async function run() {
  const briefs = Object.entries(BRIEFS).map(([slug, b]) => `
  v := pg_temp._ev('${slug}');
  if v is not null and not exists (select 1 from public.event_briefs where event_id = v and is_current) then
    r := public.save_event_brief(v, '${JSON.stringify(b).replace(/'/g, "''")}'::jsonb, null, 'Initial brief agreed with the client');
    perform pg_temp._n('briefs');
  end if;`).join("");
  return block(`
  perform pg_temp._as('${ORG}');
  ${briefs}
  -- dependency chain on the hybrid conference: in-person tier ← venue; online pass ← in-person tier; VIP ← compliance + sponsor approval
  v := pg_temp._ev('global-tech-conference');
  if v is not null and not exists (select 1 from public.event_dependencies where event_id = v) then
    perform public.add_event_dependency(v, 'ticket_tier', (select id from public.ticket_tiers where event_id = v and name = 'In-person delegate'), 'venue', null, true, 0,
      'Delegate tickets open once ExCeL is confirmed.', null);
    perform public.add_event_dependency(v, 'ticket_tier', (select id from public.ticket_tiers where event_id = v and name = 'Online pass'), 'ticket_tier',
      (select id from public.ticket_tiers where event_id = v and name = 'In-person delegate'), false, 1440, 'Online passes go on sale a day after delegate tickets.', null);
    perform public.add_event_dependency(v, 'ticket_tier', (select id from public.ticket_tiers where event_id = v and name = 'Hybrid VIP'), 'compliance', null, true, 0,
      'VIP includes the speaker dinner: licensing must be complete.', null);
    perform public.add_event_dependency(v, 'ticket_tier', (select id from public.ticket_tiers where event_id = v and name = 'Hybrid VIP'), 'approval', null, true, 0,
      'Gold sponsor signs off VIP pricing.', now() + interval '30 days');
    perform pg_temp._n('dependencies', 4);
  end if;
  -- organiser template from Neon Nights
  v := pg_temp._ev('neon-nights');
  if v is not null and not exists (select 1 from public.event_templates where source_event_id = v) then
    perform public.save_event_template(v, 'Riverside winter festival', 'Two-stage festival with bars, partners, logistics and compliance packs.', array['festival', 'nightlife'],
      jsonb_build_object('plan', true, 'schedule', true, 'providers', true, 'tickets', true, 'promotion', true, 'staffing', true, 'risk', true), null);
    perform pg_temp._n('templates');
  end if;
  -- Gala Dock platform templates (curated; service data)
  perform pg_temp._as(null);
  insert into public.event_templates(workspace_id, source_event_id, name, description, event_types, modules, version, scope, status, event_type, content, created_by)
    select null, e.id, x.name, x.descr, x.types, '{"plan":true,"schedule":true,"providers":true,"tickets":true,"risk":true}'::jsonb, 1, 'platform', 'active', x.et,
           public.event_structure_snapshot(e.id, 'template', '{"plan":true,"schedule":true,"providers":true,"tickets":true,"risk":true}'::jsonb), null
    from (values ('Gala Dock · Festival (two stages)', 'Stages, bars, partners, safety and licensing checklist for 1,000–5,000 people.', array['festival'], 'festival', 'neon-nights'),
                 ('Gala Dock · Hybrid conference', 'Sessions, speakers, streaming with captions, expo and delegate tickets.', array['conference', 'webinar'], 'conference', 'global-tech-conference'),
                 ('Gala Dock · Club night', 'Door policy, SIA team, guest list and late licence.', array['nightlife'], 'nightlife', 'warehouse-sessions-bassline')) x(name, descr, types, et, slug)
    join public.events e on e.slug = x.slug
    where not exists (select 1 from public.event_templates t where t.scope = 'platform' and t.name = x.name);
  get diagnostics n = row_count; perform pg_temp._n('platform_templates', n);
  `);
}
