-- Gala Dock — public event commerce demo seed. Idempotent (fixed UUIDs, ON CONFLICT DO NOTHING/
-- UPDATE). Seeds under the existing "Grannit Holdings" organizer workspace rather than inventing a
-- new workspace (avoids an orphan owner_user_id FK). Fictional event/artist names throughout —
-- no real celebrities or trademarked event names. Hero/gallery images are real hotlinked Unsplash
-- photography (genuine photos, stable well-known photo IDs) as a placeholder for real R2-uploaded
-- event photography — see docs/release-gated/user-fixes/public-event-commerce.md.

DO $$
DECLARE
  ws_id uuid := '045a53a6-d421-4836-bf9e-e7a5cf998834'; -- Grannit Holdings (organizer)
  owner uuid := '81b8cf5e-8f46-485a-b5b1-58f51d6109d7';
BEGIN

-- Unlock every release-stage-gated flag for this workspace too (public marketing pages already
-- resolve v2 via NEXT_PUBLIC_RELEASE_STAGE, this makes the in-app Event Manager gates match).
UPDATE public.workspaces SET release_stage = 'v2' WHERE id = ws_id;

-- ── Venues ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.venues (id, workspace_id, created_by, name, status, address_line1, city, region, country, postal_code, capacity, latitude, longitude, timezone)
VALUES
  ('b0000000-0000-4000-8000-000000000001', ws_id, owner, 'The Underground Club', 'active', '14 Digbeth High St', 'Birmingham', 'West Midlands', 'United Kingdom', 'B5 6DY', 650, 52.4780, -1.8933, 'Europe/London'),
  ('b0000000-0000-4000-8000-000000000002', ws_id, owner, 'Castle Grounds', 'active', 'Holyrood Park', 'Edinburgh', 'Scotland', 'United Kingdom', 'EH8 8HG', 15000, 55.9533, -3.1621, 'Europe/London'),
  ('b0000000-0000-4000-8000-000000000003', ws_id, owner, 'The Grand Playhouse', 'active', '12 Shaftesbury Ave', 'London', 'Greater London', 'United Kingdom', 'W1D 6BA', 900, 51.5117, -0.1308, 'Europe/London'),
  ('b0000000-0000-4000-8000-000000000004', ws_id, owner, 'Northside Conference Centre', 'active', '3 Wellington Pl', 'Leeds', 'West Yorkshire', 'United Kingdom', 'LS1 4AP', 2000, 53.7965, -1.5518, 'Europe/London'),
  ('b0000000-0000-4000-8000-000000000005', ws_id, owner, 'Riverside Pavilion', 'active', 'Harbourside Way', 'Bristol', 'South West', 'United Kingdom', 'BS1 5UH', 1200, 51.4498, -2.5981, 'Europe/London'),
  ('b0000000-0000-4000-8000-000000000006', ws_id, owner, 'The Dock Arena', 'active', '1 Trafford Wharf Rd', 'Manchester', 'Greater Manchester', 'United Kingdom', 'M17 1DH', 8000, 53.4700, -2.2972, 'Europe/London')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- ── Events ──────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.events (id, workspace_id, created_by, name, status, slug, start_at, end_at, venue_id, venue_name_snapshot, is_public, is_ticketed, cover_image_url, guest_count_evening, currency, event_type)
VALUES
  ('e0000000-0000-4000-8000-000000000001', ws_id, owner, 'Neon Nights Live', 'confirmed', 'neon-nights-live', '2026-08-14 20:00:00+01', '2026-08-15 03:00:00+01', 'b0000000-0000-4000-8000-000000000001', 'The Underground Club', true, true, 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1600&q=80', 600, 'GBP', 'Nightclub'),
  ('e0000000-0000-4000-8000-000000000002', ws_id, owner, 'Wildfire Festival 2026', 'confirmed', 'wildfire-festival-2026', '2026-09-05 12:00:00+01', '2026-09-07 23:00:00+01', 'b0000000-0000-4000-8000-000000000002', 'Castle Grounds', true, true, 'https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1600&q=80', 15000, 'GBP', 'Festival'),
  ('e0000000-0000-4000-8000-000000000003', ws_id, owner, 'Silver Owl: An Acoustic Evening', 'confirmed', 'silver-owl-acoustic-evening', '2026-08-02 19:30:00+01', '2026-08-02 22:30:00+01', 'b0000000-0000-4000-8000-000000000003', 'The Grand Playhouse', true, true, 'https://images.unsplash.com/photo-1459749411175-04bd5b0f2c3f?auto=format&fit=crop&w=1600&q=80', 900, 'GBP', 'Concert'),
  ('e0000000-0000-4000-8000-000000000004', ws_id, owner, 'Northbound: A New Play', 'confirmed', 'northbound-a-new-play', '2026-08-20 19:00:00+01', '2026-08-20 21:15:00+01', 'b0000000-0000-4000-8000-000000000003', 'The Grand Playhouse', true, true, 'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1600&q=80', 900, 'GBP', 'Theatre'),
  ('e0000000-0000-4000-8000-000000000005', ws_id, owner, 'FutureOps Summit 2026', 'confirmed', 'futureops-summit-2026', '2026-09-16 09:00:00+01', '2026-09-17 17:00:00+01', 'b0000000-0000-4000-8000-000000000004', 'Northside Conference Centre', true, true, 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1600&q=80', 2000, 'GBP', 'Conference'),
  ('e0000000-0000-4000-8000-000000000006', ws_id, owner, 'Laugh Track Live', 'confirmed', 'laugh-track-live', '2026-08-28 20:00:00+01', '2026-08-28 22:00:00+01', 'b0000000-0000-4000-8000-000000000001', 'The Underground Club', true, true, 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=1600&q=80', 500, 'GBP', 'Comedy'),
  ('e0000000-0000-4000-8000-000000000007', ws_id, owner, 'Hearts for Harbour: Charity Gala', 'confirmed', 'hearts-for-harbour-charity-gala', '2026-10-03 18:30:00+01', '2026-10-03 23:59:00+01', 'b0000000-0000-4000-8000-000000000005', 'Riverside Pavilion', true, true, 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=1600&q=80', 1200, 'GBP', 'Charity'),
  ('e0000000-0000-4000-8000-000000000008', ws_id, owner, 'Electric Parade', 'confirmed', 'electric-parade', '2026-08-09 19:00:00+01', '2026-08-10 00:30:00+01', 'b0000000-0000-4000-8000-000000000006', 'The Dock Arena', true, true, 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=80', 8000, 'GBP', 'Concert')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cover_image_url = EXCLUDED.cover_image_url;

-- ── Public pages ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.event_public_pages (
  id, event_id, workspace_id, created_by, slug, published, headline, summary, hero_path,
  seo_title, seo_description, category, event_type, city, country, starts_at, ends_at, doors_at,
  venue_name, address_line1, latitude, longitude, gallery_paths, lineup, schedule,
  accessibility_features, policies, faqs, age_restriction, organiser_name, promoted
) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', ws_id, owner,
   'neon-nights-live', true, 'Neon Nights Live',
   'One massive night at The Underground Club. Cutting-edge production, world-class DJs, immersive visuals and a crowd like no other — from pulse-pounding beats to breathing-light-show finales, this is more than a concert, it''s an experience.',
   'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1600&q=80',
   'Neon Nights Live — Birmingham', 'Get tickets to Neon Nights Live at The Underground Club, Birmingham.',
   'Music', 'Nightclub', 'Birmingham', 'United Kingdom', '2026-08-14 20:00:00+01', '2026-08-15 03:00:00+01', '2026-08-14 19:00:00+01',
   'The Underground Club', '14 Digbeth High St', 52.4780, -1.8933,
   '["https://images.unsplash.com/photo-1571266028243-e4bb35a9c73f?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1499364615650-ec38552f4f34?auto=format&fit=crop&w=1200&q=80"]'::jsonb,
   '[{"name":"DJ Aurora","role":"Headliner","startsAt":"22:00"},{"name":"Pulse Collective","role":"Live Act","startsAt":"21:00"},{"name":"Neon Drift","role":"Special Guest","startsAt":"20:30"}]'::jsonb,
   '[{"time":"19:00","title":"Doors Open","description":"Early entry + merch"},{"time":"20:30","title":"Neon Drift","description":"Special guest"},{"time":"21:00","title":"Pulse Collective","description":"Live act"},{"time":"22:00","title":"DJ Aurora","description":"Headliner set"},{"time":"02:30","title":"Event Ends","description":"Thanks for coming!"}]'::jsonb,
   '["Wheelchair accessible venue","Accessible toilets","Companion seating available"]'::jsonb,
   '{"ageRestriction":"18+ event, valid photo ID required","refundPolicy":"Tickets are refundable up to 7 days before the event.","reEntry":"No re-entry once you leave the venue.","lastEntry":"Last entry midnight."}'::jsonb,
   '[{"question":"Is this an 18+ event?","answer":"Yes, valid photo ID is required at the door."},{"question":"Is there parking nearby?","answer":"Rideshare drop-off is recommended; limited street parking nearby."}]'::jsonb,
   '18+', 'Pulse Events', true),

  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', ws_id, owner,
   'wildfire-festival-2026', true, 'Wildfire Festival 2026',
   'Three days, five stages, one unforgettable field. Wildfire Festival brings together the best in live music, street food and community across Castle Grounds, Edinburgh.',
   'https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1600&q=80',
   'Wildfire Festival 2026 — Edinburgh', 'Three-day music festival at Castle Grounds, Edinburgh.',
   'Festival', 'Festival', 'Edinburgh', 'United Kingdom', '2026-09-05 12:00:00+01', '2026-09-07 23:00:00+01', '2026-09-05 11:00:00+01',
   'Castle Grounds', 'Holyrood Park', 55.9533, -3.1621,
   '["https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80"]'::jsonb,
   '[{"name":"The Roaming Skies","role":"Headliner","stage":"Main Stage","startsAt":"21:30"},{"name":"Harlow & the Tides","role":"Support","stage":"Main Stage","startsAt":"19:30"},{"name":"Echo Valley","role":"Support","stage":"East Stage","startsAt":"17:00"}]'::jsonb,
   '[{"time":"12:00","title":"Gates Open","description":"Day 1"},{"time":"17:00","title":"Echo Valley","description":"East Stage"},{"time":"19:30","title":"Harlow & the Tides","description":"Main Stage"},{"time":"21:30","title":"The Roaming Skies","description":"Main Stage headline"}]'::jsonb,
   '["Wheelchair accessible viewing platform","Accessible campsite","Sign language interpretation on Main Stage","BSL interpreted sets"]'::jsonb,
   '{"ageRestriction":"All ages — under 16s must be accompanied by an adult","refundPolicy":"Non-refundable except on event cancellation.","bagPolicy":"Bags over A4 size are subject to search.","lastEntry":"Camping gates close at 22:00 daily."}'::jsonb,
   '[{"question":"Can I camp on site?","answer":"Yes, weekend camping tickets include pitch access from Thursday."},{"question":"What''s the age policy?","answer":"All ages welcome; under-16s must be accompanied by an adult."}]'::jsonb,
   'All ages', 'Wildfire Collective', true),

  ('d0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', ws_id, owner,
   'silver-owl-acoustic-evening', true, 'Silver Owl: An Acoustic Evening',
   'An intimate, stripped-back evening with Silver Owl at The Grand Playhouse — just voice, strings and a room that listens.',
   'https://images.unsplash.com/photo-1459749411175-04bd5b0f2c3f?auto=format&fit=crop&w=1600&q=80',
   'Silver Owl: An Acoustic Evening — London', 'Intimate acoustic concert at The Grand Playhouse, London.',
   'Music', 'Concert', 'London', 'United Kingdom', '2026-08-02 19:30:00+01', '2026-08-02 22:30:00+01', '2026-08-02 18:45:00+01',
   'The Grand Playhouse', '12 Shaftesbury Ave', 51.5117, -0.1308,
   '["https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=80"]'::jsonb,
   '[{"name":"Silver Owl","role":"Headliner","startsAt":"20:00"}]'::jsonb,
   '[{"time":"18:45","title":"Doors Open"},{"time":"20:00","title":"Silver Owl","description":"Full acoustic set"},{"time":"22:15","title":"Event Ends"}]'::jsonb,
   '["Wheelchair accessible seating","Hearing loop available"]'::jsonb,
   '{"ageRestriction":"All ages","refundPolicy":"Refundable up to 48 hours before the show.","lastEntry":"20:00"}'::jsonb,
   '[]'::jsonb, NULL, 'Grand Playhouse Presents', false),

  ('d0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000004', ws_id, owner,
   'northbound-a-new-play', true, 'Northbound: A New Play',
   'A new drama about family, distance and the roads that bring us home — from an award-nominated playwright, direct to The Grand Playhouse stage.',
   'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1600&q=80',
   'Northbound: A New Play — London', 'New drama at The Grand Playhouse, London.',
   'Theatre', 'Theatre', 'London', 'United Kingdom', '2026-08-20 19:00:00+01', '2026-08-20 21:15:00+01', '2026-08-20 18:15:00+01',
   'The Grand Playhouse', '12 Shaftesbury Ave', 51.5117, -0.1308,
   '[]'::jsonb, '[]'::jsonb,
   '[{"time":"18:15","title":"Doors Open"},{"time":"19:00","title":"Act One"},{"time":"19:45","title":"Interval"},{"time":"20:05","title":"Act Two"},{"time":"21:15","title":"Curtain"}]'::jsonb,
   '["Wheelchair accessible seating","Audio description available on request"]'::jsonb,
   '{"ageRestriction":"12+ recommended","refundPolicy":"Refundable up to 7 days before the show.","lastEntry":"19:15, latecomers admitted at a suitable break"}'::jsonb,
   '[{"question":"Is there an interval?","answer":"Yes, a 20-minute interval after Act One."}]'::jsonb,
   '12+', 'Grand Playhouse Presents', false),

  ('d0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000005', ws_id, owner,
   'futureops-summit-2026', true, 'FutureOps Summit 2026',
   'Two days of talks, workshops and networking for operators building the next generation of event and hospitality businesses.',
   'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1600&q=80',
   'FutureOps Summit 2026 — Leeds', 'Two-day operations conference in Leeds.',
   'Conference', 'Conference', 'Leeds', 'United Kingdom', '2026-09-16 09:00:00+01', '2026-09-17 17:00:00+01', '2026-09-16 08:30:00+01',
   'Northside Conference Centre', '3 Wellington Pl', 53.7965, -1.5518,
   '["https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=1200&q=80"]'::jsonb,
   '[{"name":"Priya Anand","role":"Keynote — Scaling Ops","startsAt":"09:30"},{"name":"Tom Reyes","role":"Workshop — Automations 101","startsAt":"11:00"}]'::jsonb,
   '[{"time":"08:30","title":"Registration"},{"time":"09:30","title":"Opening Keynote"},{"time":"11:00","title":"Breakout Workshops"},{"time":"17:00","title":"Day One Close"}]'::jsonb,
   '["Wheelchair accessible venue","Accessible parking on site","Quiet room available"]'::jsonb,
   '{"ageRestriction":"18+ (business event)","refundPolicy":"Refundable up to 14 days before the event.","dressCode":"Business casual"}'::jsonb,
   '[{"question":"Is there a virtual option?","answer":"No, this is an in-person only event for 2026."},{"question":"Is catering included?","answer":"Yes, lunch and refreshments are included both days."}]'::jsonb,
   NULL, 'FutureOps', false),

  ('d0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000006', ws_id, owner,
   'laugh-track-live', true, 'Laugh Track Live',
   'A rotating line-up of the UK''s sharpest new stand-up talent, live at The Underground Club.',
   'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=1600&q=80',
   'Laugh Track Live — Birmingham', 'Stand-up comedy night at The Underground Club, Birmingham.',
   'Comedy', 'Comedy', 'Birmingham', 'United Kingdom', '2026-08-28 20:00:00+01', '2026-08-28 22:00:00+01', '2026-08-28 19:30:00+01',
   'The Underground Club', '14 Digbeth High St', 52.4780, -1.8933,
   '[]'::jsonb,
   '[{"name":"Marcus Feld","role":"Headliner","startsAt":"21:00"},{"name":"Ola Whitfield","role":"Support","startsAt":"20:30"},{"name":"Dan Okoro","role":"MC","startsAt":"20:00"}]'::jsonb,
   '[{"time":"19:30","title":"Doors Open"},{"time":"20:00","title":"MC Opens"},{"time":"21:00","title":"Headline Set"},{"time":"22:00","title":"Event Ends"}]'::jsonb,
   '["Wheelchair accessible venue"]'::jsonb,
   '{"ageRestriction":"16+, strong language","refundPolicy":"Non-refundable, transferable up to 24 hours before."}'::jsonb,
   '[]'::jsonb, '16+', 'Laugh Track Comedy', false),

  ('d0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000007', ws_id, owner,
   'hearts-for-harbour-charity-gala', true, 'Hearts for Harbour: Charity Gala',
   'An evening of dinner, live music and fundraising in support of Bristol harbourside community programmes.',
   'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=1600&q=80',
   'Hearts for Harbour Charity Gala — Bristol', 'Black-tie charity gala at Riverside Pavilion, Bristol.',
   'Charity', 'Gala', 'Bristol', 'United Kingdom', '2026-10-03 18:30:00+01', '2026-10-03 23:59:00+01', '2026-10-03 18:00:00+01',
   'Riverside Pavilion', 'Harbourside Way', 51.4498, -2.5981,
   '[]'::jsonb, '[]'::jsonb,
   '[{"time":"18:00","title":"Drinks Reception"},{"time":"19:00","title":"Dinner Served"},{"time":"20:30","title":"Live Auction"},{"time":"21:30","title":"Live Music"}]'::jsonb,
   '["Wheelchair accessible venue","Accessible toilets"]'::jsonb,
   '{"ageRestriction":"18+","dressCode":"Black tie","refundPolicy":"Non-refundable — proceeds support the Harbour Community Fund."}'::jsonb,
   '[{"question":"Where do proceeds go?","answer":"100% of ticket proceeds after venue costs go to the Harbour Community Fund."}]'::jsonb,
   '18+', 'Harbour Community Fund', false),

  ('d0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000008', ws_id, owner,
   'electric-parade', true, 'Electric Parade',
   'The UK''s biggest touring electronic showcase returns to The Dock Arena for one night only — full production, laser show and a 10,000-capacity floor.',
   'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=80',
   'Electric Parade — Manchester', 'Electronic music showcase at The Dock Arena, Manchester.',
   'Music', 'Concert', 'Manchester', 'United Kingdom', '2026-08-09 19:00:00+01', '2026-08-10 00:30:00+01', '2026-08-09 18:00:00+01',
   'The Dock Arena', '1 Trafford Wharf Rd', 53.4700, -2.2972,
   '["https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80"]'::jsonb,
   '[{"name":"Vantablack","role":"Headliner","startsAt":"22:30"},{"name":"Kilo Sun","role":"Support","startsAt":"21:00"},{"name":"Reyna","role":"Opener","startsAt":"19:30"}]'::jsonb,
   '[{"time":"18:00","title":"Doors Open"},{"time":"19:30","title":"Reyna"},{"time":"21:00","title":"Kilo Sun"},{"time":"22:30","title":"Vantablack"},{"time":"00:30","title":"Event Ends"}]'::jsonb,
   '["Wheelchair accessible arena floor","Accessible viewing platform","Companion tickets available"]'::jsonb,
   '{"ageRestriction":"16+ (under 18s with adult)","refundPolicy":"Refundable up to 7 days before the event.","bagPolicy":"Small bags only, searched on entry."}'::jsonb,
   '[{"question":"Is there an accessible viewing platform?","answer":"Yes, book accessible tickets in advance via the box office."}]'::jsonb,
   '16+', 'Electric Parade Touring', true)
ON CONFLICT (id) DO UPDATE SET headline = EXCLUDED.headline, hero_path = EXCLUDED.hero_path, published = true;

-- ── Ticket tiers (real inventory — mix of available / selling fast / sold out) ────────────────
INSERT INTO public.ticket_types (id, event_id, workspace_id, created_by, name, description, price_cents, currency, quantity, sold, status)
VALUES
  -- Neon Nights Live
  ('f0000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000001', ws_id, owner, 'Early Bird', 'Limited time offer. Great value, same energy.', 5900, 'GBP', 100, 96, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000102', 'e0000000-0000-4000-8000-000000000001', ws_id, owner, 'General Admission', 'Access to main floor (standing). Great energy, best vibes.', 8900, 'GBP', 400, 276, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000103', 'e0000000-0000-4000-8000-000000000001', ws_id, owner, 'VIP Admission', 'Priority entry, VIP bar, lounge access and premium viewing.', 17900, 'GBP', 60, 32, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000104', 'e0000000-0000-4000-8000-000000000001', ws_id, owner, 'Accessible Seating', 'Accessible seating with companion options available.', 6900, 'GBP', 20, 12, 'on_sale'),
  -- Wildfire Festival 2026
  ('f0000000-0000-4000-8000-000000000201', 'e0000000-0000-4000-8000-000000000002', ws_id, owner, 'Weekend Pass', 'Full 3-day access + camping.', 14900, 'GBP', 8000, 6420, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000202', 'e0000000-0000-4000-8000-000000000002', ws_id, owner, 'Day Ticket — Saturday', 'Single-day access, Saturday only.', 6900, 'GBP', 3000, 1180, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000203', 'e0000000-0000-4000-8000-000000000002', ws_id, owner, 'VIP Weekend', 'Weekend pass + VIP viewing platform + fast-track entry.', 32900, 'GBP', 400, 400, 'on_sale'),
  -- Silver Owl
  ('f0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000003', ws_id, owner, 'General Admission', 'Reserved seating, main auditorium.', 4500, 'GBP', 850, 410, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000302', 'e0000000-0000-4000-8000-000000000003', ws_id, owner, 'Premium Stalls', 'Front stalls, best sightlines.', 7500, 'GBP', 50, 45, 'on_sale'),
  -- Northbound
  ('f0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000004', ws_id, owner, 'Standard Seating', 'Reserved seating.', 3200, 'GBP', 850, 210, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000402', 'e0000000-0000-4000-8000-000000000004', ws_id, owner, 'Premium Seating', 'Best-view reserved seating.', 5500, 'GBP', 50, 18, 'on_sale'),
  -- FutureOps Summit
  ('f0000000-0000-4000-8000-000000000501', 'e0000000-0000-4000-8000-000000000005', ws_id, owner, 'Two-Day Pass', 'Full conference access, both days.', 24900, 'GBP', 1800, 640, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000502', 'e0000000-0000-4000-8000-000000000005', ws_id, owner, 'Day Pass — Day One', 'Single-day access, Day 1 only.', 14900, 'GBP', 400, 90, 'on_sale'),
  -- Laugh Track Live
  ('f0000000-0000-4000-8000-000000000601', 'e0000000-0000-4000-8000-000000000006', ws_id, owner, 'General Admission', 'Standing/seated mixed venue.', 1800, 'GBP', 450, 205, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000602', 'e0000000-0000-4000-8000-000000000006', ws_id, owner, 'Front Row', 'Front-row seating — you have been warned.', 2800, 'GBP', 30, 30, 'on_sale'),
  -- Hearts for Harbour
  ('f0000000-0000-4000-8000-000000000701', 'e0000000-0000-4000-8000-000000000007', ws_id, owner, 'Individual Ticket', 'Dinner, drinks reception and live auction access.', 9500, 'GBP', 1000, 340, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000702', 'e0000000-0000-4000-8000-000000000007', ws_id, owner, 'Table of 10', 'Reserved table for 10 guests.', 85000, 'GBP', 20, 11, 'on_sale'),
  -- Electric Parade
  ('f0000000-0000-4000-8000-000000000801', 'e0000000-0000-4000-8000-000000000008', ws_id, owner, 'General Admission', 'Standing floor access.', 4900, 'GBP', 6000, 5480, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000802', 'e0000000-0000-4000-8000-000000000008', ws_id, owner, 'VIP Platform', 'Elevated VIP viewing platform + dedicated bar.', 9900, 'GBP', 500, 495, 'on_sale'),
  ('f0000000-0000-4000-8000-000000000803', 'e0000000-0000-4000-8000-000000000008', ws_id, owner, 'Accessible Platform', 'Accessible viewing platform with companion ticket.', 4900, 'GBP', 60, 20, 'on_sale')
ON CONFLICT (id) DO UPDATE SET price_cents = EXCLUDED.price_cents, quantity = EXCLUDED.quantity, sold = EXCLUDED.sold, status = 'on_sale';

-- ── Promo codes ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.ticket_promo_codes (id, workspace_id, event_id, code, percent_off, max_redemptions, redeemed_count, active)
VALUES
  ('c0000000-0000-4000-8000-000000000001', ws_id, 'e0000000-0000-4000-8000-000000000001', 'NEON10', 10, 100, 24, true),
  ('c0000000-0000-4000-8000-000000000002', ws_id, NULL, 'WELCOME5', 5, 500, 118, true)
ON CONFLICT (id) DO UPDATE SET active = true;

END $$;
