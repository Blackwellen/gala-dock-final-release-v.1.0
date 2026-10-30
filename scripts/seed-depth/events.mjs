// W11 / Q38: representative events for the types the demo lacked — children's party (customer, invite-only), webinar, charity,
// and more nightlife (two upcoming, one past). Created as drafts with real data; `publish.mjs` moves them through
// event_transition() (the real command) once their requirements are seeded. Idempotent by slug.
import { block } from "./lib.mjs";

const ORG = "alex.events@example.com";
const CUSTOMER = "alex.thompson@example.com";

export const EVENTS = [
  { slug: "little-explorers-6th", owner: CUSTOMER, consumer: true, name: "Maya's 6th Birthday — Little Explorers", type: "childrens_party", days: 24, hour: 13, hours: 3,
    venue: "Hampstead Scout Hall", city: "London", location: "Hampstead, London NW3", guests: 18, capacity: 30, description: "Jungle-themed party with a soft-play explorer trail, face painting and a picnic tea." },
  { slug: "future-of-live-events-webinar", owner: ORG, name: "Future of Live Events 2027 (Webinar)", type: "webinar", days: 33, hour: 16, hours: 1.5,
    city: "Online", location: "Online", capacity: 500, description: "A 90-minute briefing on ticketing, safety and sustainability trends for UK event organisers, with live Q&A and captions." },
  { slug: "hope-starts-here-charity-ball", owner: ORG, name: "Hope Starts Here Charity Ball", type: "charity", days: 52, hour: 19, hours: 5,
    venue: "The Grand Hall, Kensington", city: "London", location: "Kensington, London W8", guests: 320, capacity: 360, description: "Black-tie fundraising dinner with live auction and a string quartet, raising funds for London youth mental-health charities." },
  { slug: "warehouse-sessions-bassline", owner: ORG, name: "Warehouse Sessions: Bassline", type: "nightlife", days: 17, hour: 22, hours: 6,
    venue: "Depot Mayfield", city: "Manchester", location: "Mayfield, Manchester M1", capacity: 1200, description: "Bassline and UK garage all-nighter across two rooms. 18+ with photo ID." },
  { slug: "soho-late-lounge-fridays", owner: ORG, name: "Soho Late Lounge Fridays", type: "nightlife", days: 9, hour: 21, hours: 5,
    venue: "The Velvet Room, Soho", city: "London", location: "Soho, London W1", capacity: 280, description: "Disco, soul and house with resident DJs. Guest list until 23:00." },
  { slug: "halloween-rave-2025", owner: ORG, name: "Halloween Rave 2025", type: "nightlife", days: -363, hour: 22, hours: 5, past: true,
    venue: "Depot Mayfield", city: "Manchester", location: "Mayfield, Manchester M1", capacity: 1500, description: "Costume rave with three rooms of techno and house." },
];

export async function run() {
  const rows = EVENTS.map(e => `(${[e.slug, e.owner, e.consumer ? "consumer" : "professional", e.name, e.type, e.days, e.hour, e.hours, e.venue ?? "", e.city, e.location, e.guests ?? null, e.capacity, e.description, !!e.past]
    .map(v => v === null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`).join(",")})`).join(",\n");
  return block(`
  select count(*) into n from public.events where slug in (select x.slug from (values ${rows}) x(slug, owner, mgmt, name, type, days, hour, hours, venue, city, location, guests, capacity, description, past));
  perform pg_temp._n('events_existing', n);
  insert into public.events(owner_id, workspace_id, management, name, slug, event_type, status, visibility, starts_at, ends_at, timezone, venue_name, city, location, guest_count, capacity, currency, description, tags, settings)
  select pg_temp._uid(x.owner), case when x.mgmt = 'professional' then (select id from public.workspaces where name = 'Alex Events' and owner_id = pg_temp._uid(x.owner)) end,
         x.mgmt, x.name, x.slug, x.type, 'draft', 'private',
         (date_trunc('day', now()) + make_interval(days => x.days, hours => x.hour)) ,
         (date_trunc('day', now()) + make_interval(days => x.days, hours => x.hour) + make_interval(mins => (x.hours * 60)::int)),
         'Europe/London', x.venue, x.city, x.location, coalesce(x.guests, 0), x.capacity, 'GBP', x.description, array['demo_showcase'],
         jsonb_build_object('demo_showcase', true, 'demo_seed', 'depth-pass1') || case when x.venue <> '' then jsonb_build_object('venue_confirmed', 'true') else '{}'::jsonb end
           || case when x.type = 'webinar' then jsonb_build_object('virtual', true) else '{}'::jsonb end
  from (values ${rows}) x(slug, owner, mgmt, name, type, days, hour, hours, venue, city, location, guests, capacity, description, past)
  where not exists (select 1 from public.events e where e.slug = x.slug);
  get diagnostics n = row_count; perform pg_temp._n('events_created', n);
  `);
}
