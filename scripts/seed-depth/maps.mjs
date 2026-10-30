// Q19: maps that pass validation.
//   * Comedy Central Live (b52e…): its published plan had ONE fire exit for 384 people (validator: insufficient_exits). A second
//     protected fire exit is added and the plan republished through event_map_save — sold seats are passed back unchanged.
//   * Neon Nights: a published festival plan (two stages, standing areas bound to the Q18 access zones and the ticket tiers, bars,
//     six protected fire exits, step-free entrance) through event_map_save as the organiser.
//   * Venue structures (provider side, venue_structure_save as the venue operator): Riverside Arena republished with
//     capacity_max and calibration; Riverside Park Events Venue (Neon's venue) gets its first structure with protected exits.
import { block, sql } from "./lib.mjs";

const ORG = "alex.events@example.com", VENUE = "provider.demo@example.com";
const A = (id, asset, label, x, y, w, h, extra = {}) => ({ id, type: "asset", asset, label, x, y, w, h, ...extra });

async function neonOverlay() {
  const z = Object.fromEntries((await sql(`select name, id from public.access_zones where event_id = (select id from public.events where slug = 'neon-nights')`)).map(r => [r.name, r.id]));
  const t = Object.fromEntries((await sql(`select name, id from public.ticket_tiers where event_id = (select id from public.events where slug = 'neon-nights')`)).map(r => [r.name, r.id]));
  return [
    A("main-stage", "stage", "Main stage", 300, 20, 220, 50), A("second-stage", "stage", "Riverside stage", 40, 300, 120, 40),
    A("ga-field", "standing_area", "Arena field", 230, 110, 360, 170, { capacity: 1250, zone: z["Arena (general)"], tier: t["General Admission"] }),
    A("early-pen", "standing_area", "Front pen (early bird)", 300, 80, 220, 28, { capacity: 500, zone: z["Arena (general)"], tier: t["Early Bird"] }),
    A("vip-deck", "standing_area", "VIP deck", 620, 110, 120, 120, { capacity: 400, zone: z["VIP deck"], tier: t["VIP"] }),
    A("access-platform", "standing_area", "Accessible viewing platform", 620, 250, 90, 40, { capacity: 60, zone: z["Accessible platform"] }),
    A("backstage", "standing_area", "Backstage", 540, 20, 90, 50, { capacity: 70, zone: z["Backstage"] }),
    A("bar-1", "bar", "Main bar", 240, 300, 120, 24), A("bar-2", "bar", "VIP bar", 640, 80, 80, 20),
    A("ent-1", "entrance", "Main entrance (step-free)", 380, 380, 80, 14),
    A("fx-1", "fire_exit", "Fire exit 1", 200, 380, 24, 10, { protected: true }), A("fx-2", "fire_exit", "Fire exit 2", 560, 380, 24, 10, { protected: true }),
    A("fx-3", "fire_exit", "Fire exit 3", 10, 150, 10, 24, { protected: true }), A("fx-4", "fire_exit", "Fire exit 4", 760, 150, 10, 24, { protected: true }),
    A("fx-5", "fire_exit", "Fire exit 5", 10, 250, 10, 24, { protected: true }), A("fx-6", "fire_exit", "Fire exit 6", 760, 250, 10, 24, { protected: true }),
  ];
}

const PARK_STRUCTURE = [
  { id: "field", type: "room", label: "Main field", x: 20, y: 20, w: 760, h: 360 },
  { id: "river-path", type: "accessible_route", label: "Step-free path", points: [[420, 390], [420, 300], [660, 270]] },
  { type: "entrance", label: "Main gate", x: 380, y: 380, w: 80, h: 14 },
  { type: "exit", label: "North gate (emergency)", x: 200, y: 380, w: 24, h: 10, protected: true },
  { type: "exit", label: "East gate (emergency)", x: 560, y: 380, w: 24, h: 10, protected: true },
  { type: "exit", label: "West field exit A", x: 10, y: 150, w: 10, h: 24, protected: true },
  { type: "exit", label: "East field exit B", x: 760, y: 150, w: 10, h: 24, protected: true },
  { type: "exit", label: "West field exit C", x: 10, y: 250, w: 10, h: 24, protected: true },
  { type: "exit", label: "East field exit D", x: 760, y: 250, w: 10, h: 24, protected: true },
  { type: "loading", label: "Service yard", x: 700, y: 20, w: 80, h: 34, locked: true },
  { type: "toilets", label: "Toilet block", x: 120, y: 320, w: 70, h: 30, locked: true },
];

export async function run() {
  const neon = await neonOverlay();
  return block(`
  -- 1. Comedy Central Live: add a second protected fire exit and republish (seats in use passed back unchanged)
  perform pg_temp._as('${ORG}');
  v := pg_temp._ev('comedy-central-live');
  if v is not null and coalesce((public.event_map_validate_internal(v) -> 'stats' ->> 'exits')::int, 0) < 2 then
    r := (select overlay from public.venue_maps where event_id = v and status = 'published' order by version desc limit 1)
         || jsonb_build_array(jsonb_build_object('id', 'fx2', 'type', 'asset', 'asset', 'fire_exit', 'label', 'Fire exit 2', 'x', 430, 'y', 220, 'w', 20, 'h', 10, 'protected', true));
    perform public.event_map_save(v, r,
      coalesce((select jsonb_agg(jsonb_build_object('key', s.seat_key, 'label', s.label, 'section', s.section, 'kind', s.kind, 'tier', s.tier_id, 'accessible', s.accessible)) from public.event_seats s where s.event_id = v), '[]'),
      true, (select max(version) from public.venue_maps where event_id = v));
    perform pg_temp._n('maps_fixed');
  end if;

  -- 2. Venue structures (venue operator)
  perform pg_temp._as('${VENUE}');
  v2 := (select id from public.listings where name = 'Riverside Arena' and kind = 'venue' limit 1);
  if v2 is not null and (select capacity_max from public.venue_structures where venue_id = v2 and status = 'published') is null then
    perform public.venue_structure_save(v2, (select elements from public.venue_structures where venue_id = v2 and status = 'published'), true,
      (select max(version) from public.venue_structures where venue_id = v2),
      jsonb_build_object('capacity_max', 1200, 'calibration', jsonb_build_object('units_per_m', 10, 'rotation_deg', 0, 'origin', jsonb_build_array(0, 0))));
    perform pg_temp._n('structures_published');
  end if;
  v2 := '3967b579-8910-4198-b4b9-42587d1f01ea';   -- Riverside Park Events Venue (Neon Nights' venue)
  if not exists (select 1 from public.venue_structures where venue_id = v2 and status = 'published') then
    perform public.venue_structure_save(v2, '${JSON.stringify(PARK_STRUCTURE).replace(/'/g, "''")}'::jsonb, true, coalesce((select max(version) from public.venue_structures where venue_id = v2), 0),
      jsonb_build_object('capacity_max', 2500, 'rule_pack', 'uk_default', 'calibration', jsonb_build_object('units_per_m', 4, 'rotation_deg', 0, 'origin', jsonb_build_array(0, 0))));
    perform pg_temp._n('structures_published');
  end if;

  -- 3. Neon Nights event plan
  perform pg_temp._as('${ORG}');
  v := pg_temp._ev('neon-nights');
  if v is not null and not exists (select 1 from public.venue_maps where event_id = v and status = 'published') then
    perform public.event_map_save(v, '${JSON.stringify(neon).replace(/'/g, "''")}'::jsonb, '[]'::jsonb, true, coalesce((select max(version) from public.venue_maps where event_id = v), 0));
    perform pg_temp._n('maps_published');
  end if;
  `);
}
