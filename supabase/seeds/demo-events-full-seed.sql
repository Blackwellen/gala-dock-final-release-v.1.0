-- =============================================================================
-- Gala Dock — Full Demo Event Seed (6 events, all sections)
-- Idempotent: ON CONFLICT DO NOTHING on fixed UUIDs.
-- ⚠️  Replace <WORKSPACE_ID> with a real workspace UUID before running.
-- ⚠️  ONLY run in dev/staging. Never overwrite production data.
-- =============================================================================

DO $$
DECLARE
  ws_id   uuid := '<WORKSPACE_ID>';
  owner_id uuid;

  -- Fixed event UUIDs (idempotent)
  ev_pulse     uuid := 'eeee0001-0000-0000-0000-000000000001';
  ev_theatre   uuid := 'eeee0001-0000-0000-0000-000000000002';
  ev_festival  uuid := 'eeee0001-0000-0000-0000-000000000003';
  ev_wedding   uuid := 'eeee0001-0000-0000-0000-000000000004';
  ev_nightlife uuid := 'eeee0001-0000-0000-0000-000000000005';
  ev_gala      uuid := 'eeee0001-0000-0000-0000-000000000006';

  -- Fixed supplier UUIDs
  sup_apex     uuid := 'a001a001-0000-0000-0000-000000000001';
  sup_green    uuid := 'a001a001-0000-0000-0000-000000000002';
  sup_lens     uuid := 'a001a001-0000-0000-0000-000000000003';
  sup_guard    uuid := 'a001a001-0000-0000-0000-000000000004';
  sup_floral   uuid := 'a001a001-0000-0000-0000-000000000005';
  sup_stream   uuid := 'a001a001-0000-0000-0000-000000000006';
  sup_catering uuid := 'a001a001-0000-0000-0000-000000000007';
  sup_print    uuid := 'a001a001-0000-0000-0000-000000000008';
  sup_dj       uuid := 'a001a001-0000-0000-0000-000000000009';

BEGIN
  SELECT user_id INTO owner_id
  FROM public.workspace_members
  WHERE workspace_id = ws_id
  LIMIT 1;

-- =============================================================================
-- GLOBAL SUPPLIERS (required by event_suppliers FK)
-- =============================================================================
INSERT INTO public.suppliers (id, workspace_id, name, status) VALUES
  (sup_apex,     ws_id, 'Apex AV Productions',         'active'),
  (sup_green,    ws_id, 'Greenleaf Catering Co.',       'active'),
  (sup_lens,     ws_id, 'LensWork Photography',         'active'),
  (sup_guard,    ws_id, 'EventGuard Security',          'active'),
  (sup_floral,   ws_id, 'Floral & Event Design Co.',   'active'),
  (sup_stream,   ws_id, 'StreamPulse Live',             'active'),
  (sup_catering, ws_id, 'Gala Catering London',         'active'),
  (sup_print,    ws_id, 'Printcraft UK',                'active'),
  (sup_dj,       ws_id, 'SoundLab DJ Services',         'active')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 1. PULSE SUMMIT & AFTER DARK 2026 — confirmed | corporate/conference
-- =============================================================================
INSERT INTO public.events (
  id, workspace_id, name, slug, status, event_type, event_format,
  start_at, end_at,
  venue_name_snapshot, venue_address_snapshot, location,
  guest_count_day, guest_count_evening, capacity_online,
  budget_cents, quote_value_cents, currency,
  client_name, client_company, client_email,
  description, objectives,
  is_public, is_ticketed, is_vip, is_hybrid, tags,
  cover_image_url, owner_user_id,
  risk_level, readiness_score, next_action, next_action_due,
  created_by, created_at, updated_at
) VALUES (
  ev_pulse, ws_id,
  'Pulse Summit & After Dark 2026', 'pulse-summit-2026',
  'confirmed', 'conference', 'hybrid',
  '2026-09-18 09:00:00+01', '2026-09-20 23:59:00+01',
  'Riverside Convention Center', 'Royal Victoria Dock, London E16 1XL', 'London',
  1250, 800, 2500,
  42000000, 48000000, 'GBP',
  'James Taylor', 'Pulse Events Ltd', 'james@pulseevents.co.uk',
  'Three-day hybrid conference & evening gala blending keynotes, workshops, and networking for global attendees.',
  'Showcase UK tech leadership · Drive 500 B2B leads · Deliver 4.5★ NPS',
  true, true, true, true,
  ARRAY['corporate','conference','hybrid','vip','ticketed','large-scale'],
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=90',
  owner_id,
  'medium', 78, 'Confirm AV rig spec with Apex', '2026-08-20',
  owner_id, now() - interval '45 days', now()
) ON CONFLICT (id) DO NOTHING;

-- Run sheet — Pulse Summit
INSERT INTO public.event_run_sheet_items
  (id, workspace_id, event_id, section, title, start_time, end_time, department, notes, position)
VALUES
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 1 — Registration', 'Doors Open / Registration', '08:00', '09:30', 'logistics', 'All stands live by 07:45', 1),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 1 — Keynotes', 'CEO Welcome Keynote', '09:30', '10:15', 'host', 'Intro video runs first', 2),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 1 — Keynotes', 'Keynote: AI in Business', '10:15', '11:00', 'av', 'Live-streamed to online attendees', 3),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 1 — Lunch', 'Lunch Service', '12:30', '14:00', 'catering', 'Vegan-first buffet', 4),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 1 — Evening', 'VIP Welcome Reception', '18:00', '20:00', 'vip', 'Sky Suite Level 3. Invitation only', 5),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 2 — Keynotes', 'Series B Investor Panel', '09:00', '10:30', 'av', 'Investor panel keynote', 6),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 2 — VIP Dinner', 'VIP Gala Dinner', '19:00', '22:30', 'vip', '300 covers. Black tie.', 7),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 3 — Final', 'Closing Awards Ceremony', '10:30', '12:00', 'host', '8 award categories', 8),
  (gen_random_uuid(), ws_id, ev_pulse, 'Day 3 — After Dark', 'After Dark Party', '20:00', '01:00', 'general', 'DJ sets, open bar', 9)
ON CONFLICT DO NOTHING;

-- Suppliers — Pulse Summit
INSERT INTO public.event_suppliers
  (id, workspace_id, event_id, supplier_id, supplier_name, role, status, contract_value_cents, contact_name, contact_email)
VALUES
  (gen_random_uuid(), ws_id, ev_pulse, sup_apex,     'Apex AV Productions',       'AV & Production',    'confirmed',  1200000, 'Liam Carter',  'liam@apexav.co.uk'),
  (gen_random_uuid(), ws_id, ev_pulse, sup_green,    'Greenleaf Catering Co.',    'Catering',           'confirmed',   850000, 'Sarah Patel',  'sarah@greenleaf.co.uk'),
  (gen_random_uuid(), ws_id, ev_pulse, sup_lens,     'LensWork Photography',      'Photography',        'confirmed',   180000, 'Nia Brown',    'nia@lenswork.co.uk'),
  (gen_random_uuid(), ws_id, ev_pulse, sup_guard,    'EventGuard Security',       'Security',           'confirmed',   220000, 'Dave Moss',    'dave@eventguard.co.uk'),
  (gen_random_uuid(), ws_id, ev_pulse, sup_stream,   'StreamPulse Live',          'Live Streaming',     'confirmed',   145000, 'Tom Hayes',    'tom@streampulse.io'),
  (gen_random_uuid(), ws_id, ev_pulse, sup_print,    'Printcraft UK',             'Print & Signage',    'confirmed',    62000, 'Beth Yates',   'beth@printcraft.co.uk'),
  (gen_random_uuid(), ws_id, ev_pulse, sup_floral,   'Floral & Event Design Co.','Décor & Floral',     'shortlisted',  95000, 'Amara Diallo', 'amara@fedral.co.uk')
ON CONFLICT DO NOTHING;

-- Tasks — Pulse Summit
INSERT INTO public.event_tasks
  (id, workspace_id, event_id, title, status, priority, due_date, department, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_pulse, 'Confirm final headcount with Riverside Convention Center', 'completed',   'high',   '2026-08-01', 'logistics', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Sign off all supplier contracts',                          'in_progress', 'high',   '2026-08-15', 'ops',       owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Send Wave 2 guest invitations',                            'not_started', 'high',   '2026-08-10', 'comms',     owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Confirm AV rig spec with Apex AV',                         'in_progress', 'high',   '2026-08-20', 'av',        owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Finalise VIP gala dinner menu',                            'waiting',     'medium', '2026-08-25', 'catering',  owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Upload press pack to Documents',                            'completed',   'medium', '2026-07-20', 'pr',        owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Complete staff briefing packs',                             'approved',    'high',   '2026-09-10', 'ops',       owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Confirm streaming platform integration test',               'not_started', 'high',   '2026-09-05', 'av',        owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Finalise floor plan with venue ops team',                   'completed',   'high',   '2026-08-05', 'logistics', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Review and approve After Dark DJ rider',                    'waiting',     'medium', '2026-08-30', 'ops',       owner_id)
ON CONFLICT DO NOTHING;

-- Expenses — Pulse Summit
INSERT INTO public.event_expenses
  (id, workspace_id, event_id, category, description, amount_cents, expense_date, supplier_id, status, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_pulse, 'av',        'AV Production — Deposit 50%',     600000, '2026-07-01', sup_apex,  'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'catering',  'Catering — Deposit 30%',           255000, '2026-07-05', sup_green, 'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'venue',     'Venue Hire — Riverside Center',  1800000, '2026-06-15', NULL,      'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'security',  'Security — Full Event',            220000, '2026-08-01', sup_guard, 'pending',  owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'stationery','Print & Signage Full Order',        62000, '2026-07-20', sup_print, 'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'photography','Photography — 50% Deposit',        90000, '2026-07-15', sup_lens,  'approved', owner_id)
ON CONFLICT DO NOTHING;

-- Budget lines — Pulse Summit
INSERT INTO public.event_budget_lines
  (id, workspace_id, event_id, category, description, quantity, unit_cost_cents, currency, status)
VALUES
  (gen_random_uuid(), ws_id, ev_pulse, 'venue',       'Venue Hire — Riverside Convention Center', 1, 1800000, 'GBP', 'committed'),
  (gen_random_uuid(), ws_id, ev_pulse, 'av',          'AV Production — Full Rig',                 1, 1200000, 'GBP', 'committed'),
  (gen_random_uuid(), ws_id, ev_pulse, 'catering',    'Catering — 3 days, vegan-first',           1,  850000, 'GBP', 'committed'),
  (gen_random_uuid(), ws_id, ev_pulse, 'security',    'Security — 45 staff × 3 days',             1,  220000, 'GBP', 'planned'),
  (gen_random_uuid(), ws_id, ev_pulse, 'photography', 'Photography & Videography',                1,  180000, 'GBP', 'committed'),
  (gen_random_uuid(), ws_id, ev_pulse, 'streaming',   'Live Stream Platform',                     1,  145000, 'GBP', 'planned'),
  (gen_random_uuid(), ws_id, ev_pulse, 'floristry',   'Stage & VIP Décor',                        1,   95000, 'GBP', 'planned'),
  (gen_random_uuid(), ws_id, ev_pulse, 'stationery',  'Print, Signage & Lanyards',                1,   62000, 'GBP', 'committed'),
  (gen_random_uuid(), ws_id, ev_pulse, 'contingency', 'Contingency 5%',                           1,  210000, 'GBP', 'planned')
ON CONFLICT DO NOTHING;

-- Guests — Pulse Summit
INSERT INTO public.event_guests
  (id, workspace_id, event_id, first_name, last_name, full_name, email, company, segment, rsvp_status, attendance_mode, check_in_status, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_pulse, 'Alex',   'Morgan',   'Alex Morgan',    'alex.morgan@brightline.io',    'Brightline Inc',    'vip',     'confirmed', 'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Priya',  'Shah',     'Priya Shah',     'priya.shah@nexora.com',         'Nexora',            'speaker', 'confirmed', 'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'David',  'Chen',     'David Chen',     'david.chen@horizonvc.com',      'Horizon VC',        'sponsor', 'pending',   'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Sarah',  'Williams', 'Sarah Williams', 'sarah@techforward.co.uk',       'TechForward',       'customer','confirmed', 'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Marcus', 'Liu',      'Marcus Liu',     'marcus.liu@scalehq.io',         'Scale HQ',          'vip',     'confirmed', 'online',    'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Emily',  'Osei',     'Emily Osei',     'emily.osei@innovatehub.co',     'Innovate Hub',      'speaker', 'confirmed', 'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Jake',   'Hartwell', 'Jake Hartwell',  'jake@magnumcap.co.uk',          'Magnum Capital',    'sponsor', 'declined',  'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_pulse, 'Zara',   'Ahmed',    'Zara Ahmed',     'zara@launchpad.io',             'Launchpad Ventures','customer','confirmed', 'in_person', 'not_arrived', owner_id)
ON CONFLICT DO NOTHING;

-- Activity — Pulse Summit
INSERT INTO public.event_activity
  (id, workspace_id, event_id, action, entity_type, actor_name, description, created_at)
VALUES
  (gen_random_uuid(), ws_id, ev_pulse, 'status_change', 'event',    'Jane Cooper',   'Event status updated to Confirmed',                         now() - interval '20 days'),
  (gen_random_uuid(), ws_id, ev_pulse, 'created',       'supplier', 'Jane Cooper',   'Apex AV Productions confirmed as AV supplier',              now() - interval '18 days'),
  (gen_random_uuid(), ws_id, ev_pulse, 'uploaded',      'document', 'Cody Fisher',   'Press pack uploaded to Documents',                          now() - interval '15 days'),
  (gen_random_uuid(), ws_id, ev_pulse, 'updated',       'task',     'Jane Cooper',   'Task "Confirm AV rig spec" updated to In Progress',         now() - interval '5 days'),
  (gen_random_uuid(), ws_id, ev_pulse, 'commented',     'event',    'Darrell Steward','Note added: VIP dinner menu options reviewed with client', now() - interval '2 days'),
  (gen_random_uuid(), ws_id, ev_pulse, 'updated',       'event',    'Jane Cooper',   'Readiness score updated to 78%',                            now() - interval '1 day')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 2. THEATRE GALA NIGHT — confirmed | theatre
-- =============================================================================
INSERT INTO public.events (
  id, workspace_id, name, slug, status, event_type,
  start_at, end_at,
  venue_name_snapshot, venue_address_snapshot, location,
  guest_count_day, guest_count_evening,
  budget_cents, quote_value_cents, currency,
  client_name, client_company, client_email,
  description,
  is_public, is_ticketed, is_vip, tags,
  cover_image_url, owner_user_id,
  risk_level, readiness_score, next_action, next_action_due,
  created_by, created_at, updated_at
) VALUES (
  ev_theatre, ws_id,
  'Theatre Gala Night', 'theatre-gala-night-2026',
  'confirmed', 'theatre',
  '2026-06-11 19:00:00+01', '2026-06-11 22:30:00+01',
  'Grand Opera House', 'Bow Street, London WC2E 9DD', 'London',
  350, 350,
  8500000, 9200000, 'GBP',
  'Victoria Arts Society', 'Victoria Arts Society', 'events@victoriaarts.org.uk',
  'Prestigious black-tie charity gala evening celebrating the performing arts with dinner, live performances and auction.',
  true, true, true,
  ARRAY['theatre','gala','charity','black-tie','arts'],
  'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=1200&q=90',
  owner_id,
  'low', 92, 'Final rehearsal walkthrough', '2026-06-09',
  owner_id, now() - interval '60 days', now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_run_sheet_items
  (id, workspace_id, event_id, section, title, start_time, end_time, department, position)
VALUES
  (gen_random_uuid(), ws_id, ev_theatre, 'Pre-Show', 'Doors Open & Welcome Drinks',       '18:00', '19:00', 'host', 1),
  (gen_random_uuid(), ws_id, ev_theatre, 'Show',     'Opening Address',                    '19:00', '19:15', 'host', 2),
  (gen_random_uuid(), ws_id, ev_theatre, 'Show',     'Act I — Performance',                '19:15', '20:15', 'av',   3),
  (gen_random_uuid(), ws_id, ev_theatre, 'Interval', 'Champagne Interval',                 '20:15', '20:45', 'catering', 4),
  (gen_random_uuid(), ws_id, ev_theatre, 'Show',     'Act II — Performance',               '20:45', '21:45', 'av',   5),
  (gen_random_uuid(), ws_id, ev_theatre, 'Post-Show','Charity Auction',                    '21:45', '22:15', 'host', 6),
  (gen_random_uuid(), ws_id, ev_theatre, 'Post-Show','Closing & Networking',               '22:15', '22:30', 'general', 7)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_suppliers
  (id, workspace_id, event_id, supplier_id, supplier_name, role, status, contract_value_cents, contact_name)
VALUES
  (gen_random_uuid(), ws_id, ev_theatre, sup_apex,     'Apex AV Productions',       'Sound & Lighting',   'confirmed',  380000, 'Liam Carter'),
  (gen_random_uuid(), ws_id, ev_theatre, sup_catering, 'Gala Catering London',      'Catering & Bar',     'confirmed',  290000, 'Sophie Grant'),
  (gen_random_uuid(), ws_id, ev_theatre, sup_floral,   'Floral & Event Design Co.','Table Décor',        'confirmed',  145000, 'Amara Diallo'),
  (gen_random_uuid(), ws_id, ev_theatre, sup_lens,     'LensWork Photography',      'Photography',        'confirmed',   95000, 'Nia Brown')
ON CONFLICT DO NOTHING;

INSERT INTO public.event_tasks
  (id, workspace_id, event_id, title, status, priority, due_date, department, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_theatre, 'Confirm final guest list with client',    'completed',   'high',   '2026-06-01', 'comms',    owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'Arrange flowers with Floral Design Co.', 'completed',   'high',   '2026-06-05', 'logistics',owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'Final rehearsal walkthrough at venue',    'not_started', 'high',   '2026-06-09', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'Prepare auction paddle packs',            'completed',   'medium', '2026-06-08', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'Brief ushers and front-of-house staff',   'in_progress', 'high',   '2026-06-10', 'ops',      owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_expenses
  (id, workspace_id, event_id, category, description, amount_cents, expense_date, supplier_id, status, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_theatre, 'venue',     'Grand Opera House Hire',       3200000, '2026-05-01', NULL,       'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'av',        'AV Sound & Lighting',           380000, '2026-05-10', sup_apex,   'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'catering',  'Gala Dinner & Bar',             290000, '2026-05-15', sup_catering,'approved',owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'floristry', 'Table Décor & Floral',          145000, '2026-05-20', sup_floral, 'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'photography','Photography',                   95000, '2026-06-01', sup_lens,   'approved', owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_guests
  (id, workspace_id, event_id, first_name, last_name, full_name, email, company, segment, rsvp_status, attendance_mode, check_in_status, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_theatre, 'Lady Catherine', 'Moore',   'Lady Catherine Moore', 'c.moore@victoriaarts.org', 'Victoria Arts Society', 'vip',     'confirmed', 'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'James',          'Thornton','James Thornton',       'j.thornton@legalco.uk',    'Thornton Legal',        'sponsor', 'confirmed', 'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'Helen',          'Whitmore','Helen Whitmore',       'helen@artscouncil.org.uk', 'Arts Council England',  'vip',     'confirmed', 'in_person', 'not_arrived', owner_id),
  (gen_random_uuid(), ws_id, ev_theatre, 'Peter',          'Collins', 'Peter Collins',        'peter@collectorsclub.co',  'The Collectors Club',   'customer','confirmed', 'in_person', 'not_arrived', owner_id)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. RIVERSIDE FOOD FESTIVAL 2026 — in_delivery | festival
-- =============================================================================
INSERT INTO public.events (
  id, workspace_id, name, slug, status, event_type,
  start_at, end_at,
  venue_name_snapshot, venue_address_snapshot, location,
  guest_count_day, guest_count_evening,
  budget_cents, quote_value_cents, currency,
  client_name, client_company, client_email,
  description,
  is_public, is_ticketed, tags,
  cover_image_url, owner_user_id,
  risk_level, readiness_score, next_action, next_action_due,
  created_by, created_at, updated_at
) VALUES (
  ev_festival, ws_id,
  'Riverside Food Festival 2026', 'riverside-food-festival-2026',
  'in_delivery', 'festival',
  '2026-06-26 11:00:00+01', '2026-06-26 22:00:00+01',
  'Harbour Park', 'Thames Riverside, London SE1 2TH', 'London',
  3500, 1200,
  28000000, 32000000, 'GBP',
  'London Food & Drink', 'London Food & Drink Ltd', 'ops@londonfooddrink.co.uk',
  'Open-air food festival featuring 80+ street food vendors, live music, chef demos and cocktail bars along the Thames.',
  true, true,
  ARRAY['festival','food','outdoor','music','public','ticketed'],
  'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&q=90',
  owner_id,
  'high', 95, 'Final vendor briefing', '2026-06-25',
  owner_id, now() - interval '90 days', now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_run_sheet_items
  (id, workspace_id, event_id, section, title, start_time, end_time, department, position)
VALUES
  (gen_random_uuid(), ws_id, ev_festival, 'Vendor Setup', 'Vendor Load-In Begins',             '07:00', '10:00', 'logistics', 1),
  (gen_random_uuid(), ws_id, ev_festival, 'Vendor Setup', 'Safety & Fire Marshal Check',        '10:00', '10:30', 'logistics', 2),
  (gen_random_uuid(), ws_id, ev_festival, 'Event Day',    'Festival Gates Open',                '11:00', '11:00', 'host',      3),
  (gen_random_uuid(), ws_id, ev_festival, 'Event Day',    'Chef Demo Stage — Brunch Session',   '12:00', '13:00', 'host',      4),
  (gen_random_uuid(), ws_id, ev_festival, 'Event Day',    'Live Music — Main Stage',            '14:00', '16:00', 'av',        5),
  (gen_random_uuid(), ws_id, ev_festival, 'Event Day',    'Chef Demo Stage — Evening Session',  '16:30', '17:30', 'host',      6),
  (gen_random_uuid(), ws_id, ev_festival, 'Evening',      'Sunset Live Music Session',          '19:00', '22:00', 'av',        7),
  (gen_random_uuid(), ws_id, ev_festival, 'Close',        'Vendor Pack-Down',                   '22:00', '00:00', 'logistics', 8)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_suppliers
  (id, workspace_id, event_id, supplier_id, supplier_name, role, status, contract_value_cents, contact_name)
VALUES
  (gen_random_uuid(), ws_id, ev_festival, sup_apex,  'Apex AV Productions',    'Main Stage AV',         'confirmed',  650000, 'Liam Carter'),
  (gen_random_uuid(), ws_id, ev_festival, sup_guard, 'EventGuard Security',    'Event Security',        'confirmed',  480000, 'Dave Moss'),
  (gen_random_uuid(), ws_id, ev_festival, sup_lens,  'LensWork Photography',   'Photography & Video',   'confirmed',  220000, 'Nia Brown'),
  (gen_random_uuid(), ws_id, ev_festival, sup_print, 'Printcraft UK',          'Signage & Wayfinding',  'confirmed',  180000, 'Beth Yates')
ON CONFLICT DO NOTHING;

INSERT INTO public.event_tasks
  (id, workspace_id, event_id, title, status, priority, due_date, department, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_festival, 'Final vendor briefing packs distributed', 'in_progress', 'high',   '2026-06-25', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'Confirm supplier final balance payments', 'in_progress', 'high',   '2026-06-24', 'finance',  owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'Crowd management plan signed off',        'completed',   'high',   '2026-06-20', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'Stage tech rider reviewed with Apex AV',  'completed',   'high',   '2026-06-18', 'av',       owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'Health & safety briefing with all staff', 'not_started', 'high',   '2026-06-26', 'ops',      owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_expenses
  (id, workspace_id, event_id, category, description, amount_cents, expense_date, supplier_id, status, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_festival, 'venue',    'Harbour Park Site License',     1200000, '2026-04-01', NULL,       'paid',     owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'av',       'Main Stage AV',                  650000, '2026-04-15', sup_apex,   'paid',     owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'security', 'Event Security Full Day',         480000, '2026-05-01', sup_guard,  'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'marketing','Paid Social & Outdoor Ads',       350000, '2026-05-15', NULL,       'paid',     owner_id),
  (gen_random_uuid(), ws_id, ev_festival, 'stationery','Wayfinding & Signage',           180000, '2026-06-01', sup_print,  'approved', owner_id)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 4. HARTWELL & LEE WEDDING — quoting | wedding
-- =============================================================================
INSERT INTO public.events (
  id, workspace_id, name, slug, status, event_type,
  start_at, end_at,
  venue_name_snapshot, venue_address_snapshot, location,
  guest_count_day, guest_count_evening,
  budget_cents, quote_value_cents, currency,
  client_name, client_company, client_email,
  description,
  is_vip, tags,
  cover_image_url, owner_user_id,
  risk_level, readiness_score, next_action, next_action_due,
  created_by, created_at, updated_at
) VALUES (
  ev_wedding, ws_id,
  'Hartwell & Lee Wedding', 'hartwell-lee-wedding-2026',
  'quoting', 'wedding',
  '2026-08-15 12:00:00+01', '2026-08-15 23:59:00+01',
  'The Loft at Bankside', '1 Bankside, London SE1 9JE', 'London',
  120, 200,
  5500000, 6200000, 'GBP',
  'Harrison & Lee Families', NULL, 'wedding@hartwell.co.uk',
  'Intimate luxury wedding for 120 day guests and 200 evening, with outdoor ceremony, fine dining reception and live jazz.',
  true,
  ARRAY['wedding','private','luxury','intimate','vip'],
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=1200&q=90',
  owner_id,
  'low', 45, 'Present final quote to client', '2026-07-10',
  owner_id, now() - interval '15 days', now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_tasks
  (id, workspace_id, event_id, title, status, priority, due_date, department, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_wedding, 'Present final wedding proposal to clients',   'not_started', 'high',   '2026-07-10', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_wedding, 'Confirm venue availability with The Loft',    'completed',   'high',   '2026-07-01', 'logistics',owner_id),
  (gen_random_uuid(), ws_id, ev_wedding, 'Obtain catering quote from Gala Catering',    'in_progress', 'medium', '2026-07-05', 'catering', owner_id),
  (gen_random_uuid(), ws_id, ev_wedding, 'Prepare mood board and style guide',          'in_progress', 'medium', '2026-07-08', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_wedding, 'Gather supplier availability confirmations',  'not_started', 'medium', '2026-07-12', 'ops',      owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_suppliers
  (id, workspace_id, event_id, supplier_id, supplier_name, role, status, contract_value_cents, contact_name)
VALUES
  (gen_random_uuid(), ws_id, ev_wedding, sup_catering, 'Gala Catering London',     'Fine Dining',     'pending', 280000, 'Sophie Grant'),
  (gen_random_uuid(), ws_id, ev_wedding, sup_floral,   'Floral & Event Design Co.','Flowers & Décor', 'pending', 120000, 'Amara Diallo'),
  (gen_random_uuid(), ws_id, ev_wedding, sup_lens,     'LensWork Photography',     'Photography',     'pending',  95000, 'Nia Brown'),
  (gen_random_uuid(), ws_id, ev_wedding, sup_dj,       'SoundLab DJ Services',     'Live Jazz & DJ',  'pending',  75000, 'Carlos Rivera')
ON CONFLICT DO NOTHING;

INSERT INTO public.event_guests
  (id, workspace_id, event_id, first_name, last_name, full_name, email, segment, rsvp_status, attendance_mode, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_wedding, 'Emily',    'Hartwell', 'Emily Hartwell',    'emily.hartwell@gmail.com',  'vip', 'confirmed', 'in_person', owner_id),
  (gen_random_uuid(), ws_id, ev_wedding, 'James',    'Lee',      'James Lee',         'james.lee@gmail.com',        'vip', 'confirmed', 'in_person', owner_id),
  (gen_random_uuid(), ws_id, ev_wedding, 'Margaret', 'Hartwell', 'Margaret Hartwell', 'm.hartwell@email.co.uk',     'vip', 'confirmed', 'in_person', owner_id),
  (gen_random_uuid(), ws_id, ev_wedding, 'Thomas',   'Lee',      'Thomas Lee',        'thomas.lee@email.co.uk',     'vip', 'confirmed', 'in_person', owner_id)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. AFTER DARK CLUB NIGHT — confirmed | nightlife
-- =============================================================================
INSERT INTO public.events (
  id, workspace_id, name, slug, status, event_type,
  start_at, end_at,
  venue_name_snapshot, venue_address_snapshot, location,
  guest_count_evening,
  budget_cents, quote_value_cents, currency,
  client_name, client_email,
  description,
  is_ticketed, is_vip, tags,
  cover_image_url, owner_user_id,
  risk_level, readiness_score, next_action, next_action_due,
  created_by, created_at, updated_at
) VALUES (
  ev_nightlife, ws_id,
  'After Dark Club Night', 'after-dark-club-night-jun-2026',
  'confirmed', 'nightlife',
  '2026-06-13 20:00:00+01', '2026-06-14 02:00:00+01',
  'Club Nebula', '42 Shoreditch High St, London E1 6JJ', 'London',
  450,
  1800000, 2100000, 'GBP',
  'Nebula Events', 'ops@nebulaevents.co.uk',
  'Exclusive VIP club night featuring headline DJs, cocktail masterclasses and private booths. Invite-only guest list.',
  true, true,
  ARRAY['nightlife','vip','club','dj','private','invite-only'],
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&q=90',
  owner_id,
  'low', 88, 'Final DJ set running order', '2026-06-12',
  owner_id, now() - interval '30 days', now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_run_sheet_items
  (id, workspace_id, event_id, section, title, start_time, end_time, department, position)
VALUES
  (gen_random_uuid(), ws_id, ev_nightlife, 'Doors', 'VIP Guest Arrival & Welcome',  '20:00', '21:00', 'host', 1),
  (gen_random_uuid(), ws_id, ev_nightlife, 'Night', 'Cocktail Masterclass — Bar A', '21:00', '22:00', 'general', 2),
  (gen_random_uuid(), ws_id, ev_nightlife, 'Night', 'DJ Set — Opening Set',         '21:30', '23:00', 'av', 3),
  (gen_random_uuid(), ws_id, ev_nightlife, 'Night', 'Headline DJ Set',              '23:00', '01:00', 'av', 4),
  (gen_random_uuid(), ws_id, ev_nightlife, 'Close', 'Last Orders & Wind Down',      '01:00', '02:00', 'general', 5)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_suppliers
  (id, workspace_id, event_id, supplier_id, supplier_name, role, status, contract_value_cents, contact_name)
VALUES
  (gen_random_uuid(), ws_id, ev_nightlife, sup_dj,    'SoundLab DJ Services',   'Headline & Opening DJs', 'confirmed', 380000, 'Carlos Rivera'),
  (gen_random_uuid(), ws_id, ev_nightlife, sup_apex,  'Apex AV Productions',    'Sound & Lighting Rig',   'confirmed', 240000, 'Liam Carter'),
  (gen_random_uuid(), ws_id, ev_nightlife, sup_guard, 'EventGuard Security',    'Door & Club Security',   'confirmed',  95000, 'Dave Moss')
ON CONFLICT DO NOTHING;

INSERT INTO public.event_tasks
  (id, workspace_id, event_id, title, status, priority, due_date, department, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_nightlife, 'Confirm guest list with club manager',    'completed',   'high',   '2026-06-10', 'ops',  owner_id),
  (gen_random_uuid(), ws_id, ev_nightlife, 'Finalise DJ set running order',           'in_progress', 'high',   '2026-06-12', 'av',   owner_id),
  (gen_random_uuid(), ws_id, ev_nightlife, 'Brief door team on VIP wristband system', 'not_started', 'high',   '2026-06-13', 'ops',  owner_id),
  (gen_random_uuid(), ws_id, ev_nightlife, 'Send invitations to VIP guest list',      'completed',   'medium', '2026-06-07', 'comms',owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_expenses
  (id, workspace_id, event_id, category, description, amount_cents, expense_date, supplier_id, status, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_nightlife, 'venue',         'Club Nebula Hire',         750000, '2026-05-20', NULL,      'paid',     owner_id),
  (gen_random_uuid(), ws_id, ev_nightlife, 'entertainment', 'Headline DJ Fee',           380000, '2026-05-25', sup_dj,    'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_nightlife, 'av',            'Sound & Lighting Rig',     240000, '2026-06-01', sup_apex,  'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_nightlife, 'security',      'Door & Club Security',      95000, '2026-06-01', sup_guard, 'approved', owner_id)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 6. GALA DINNER — RIVERSIDE BALLROOM — in_delivery | corporate dinner
-- =============================================================================
INSERT INTO public.events (
  id, workspace_id, name, slug, status, event_type,
  start_at, end_at,
  venue_name_snapshot, venue_address_snapshot, location,
  guest_count_evening,
  budget_cents, quote_value_cents, currency,
  client_name, client_company, client_email,
  description,
  is_ticketed, is_vip, tags,
  cover_image_url, owner_user_id,
  risk_level, readiness_score, next_action, next_action_due,
  created_by, created_at, updated_at
) VALUES (
  ev_gala, ws_id,
  'Gala Dinner — Riverside Ballroom', 'gala-dinner-riverside-jun-2026',
  'in_delivery', 'corporate_dinner',
  '2026-06-24 18:30:00+01', '2026-06-24 23:00:00+01',
  'Riverside Ballroom', 'Strand, London WC2R 1LA', 'London',
  250,
  14500000, 16000000, 'GBP',
  'Grannit Holdings', 'Grannit Holdings Ltd', 'events@grannit.co.uk',
  'Prestigious annual corporate gala dinner for 250 guests with awards ceremony, live entertainment and charity raffle.',
  true, true,
  ARRAY['corporate','gala','dinner','awards','charity','vip'],
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1200&q=90',
  owner_id,
  'low', 96, 'Final seating plan sign-off', '2026-06-23',
  owner_id, now() - interval '75 days', now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_run_sheet_items
  (id, workspace_id, event_id, section, title, start_time, end_time, department, position)
VALUES
  (gen_random_uuid(), ws_id, ev_gala, 'Arrival',   'Guest Arrival & Welcome Drinks', '18:30', '19:30', 'host',      1),
  (gen_random_uuid(), ws_id, ev_gala, 'Dinner',    'Guests Seated — Starter Served',  '19:30', '20:00', 'catering',  2),
  (gen_random_uuid(), ws_id, ev_gala, 'Dinner',    'Welcome Address & Award Speeches', '20:00', '20:30', 'host',      3),
  (gen_random_uuid(), ws_id, ev_gala, 'Dinner',    'Main Course & Wine Service',       '20:30', '21:30', 'catering',  4),
  (gen_random_uuid(), ws_id, ev_gala, 'Awards',    'Annual Awards Ceremony',           '21:30', '22:30', 'host',      5),
  (gen_random_uuid(), ws_id, ev_gala, 'Close',     'Dessert, Charity Raffle & Close',  '22:30', '23:00', 'catering',  6)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_suppliers
  (id, workspace_id, event_id, supplier_id, supplier_name, role, status, contract_value_cents, contact_name)
VALUES
  (gen_random_uuid(), ws_id, ev_gala, sup_catering, 'Gala Catering London',      'Fine Dining & Bar',  'confirmed',  680000, 'Sophie Grant'),
  (gen_random_uuid(), ws_id, ev_gala, sup_floral,   'Floral & Event Design Co.','Table Décor',        'confirmed',  210000, 'Amara Diallo'),
  (gen_random_uuid(), ws_id, ev_gala, sup_apex,     'Apex AV Productions',      'Sound & AV',         'confirmed',  180000, 'Liam Carter'),
  (gen_random_uuid(), ws_id, ev_gala, sup_lens,     'LensWork Photography',     'Photography',        'confirmed',  120000, 'Nia Brown'),
  (gen_random_uuid(), ws_id, ev_gala, sup_print,    'Printcraft UK',            'Menus & Programmes', 'confirmed',   45000, 'Beth Yates')
ON CONFLICT DO NOTHING;

INSERT INTO public.event_tasks
  (id, workspace_id, event_id, title, status, priority, due_date, department, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_gala, 'Finalise seating plan with client',       'in_progress', 'high',   '2026-06-23', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Confirm awards trophy engraving order',   'completed',   'high',   '2026-06-15', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Send final invoice to client',            'completed',   'high',   '2026-06-20', 'finance',  owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Brief floor team on table service plan',  'not_started', 'high',   '2026-06-24', 'ops',      owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Confirm charity auction lots with client','completed',   'medium', '2026-06-18', 'ops',      owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_expenses
  (id, workspace_id, event_id, category, description, amount_cents, expense_date, supplier_id, status, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_gala, 'venue',     'Riverside Ballroom Hire',   4800000, '2026-05-01', NULL,        'paid',     owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'catering',  'Fine Dining — 250 covers',   680000, '2026-05-15', sup_catering,'paid',     owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'floristry', 'Table & Stage Décor',         210000, '2026-05-20', sup_floral,  'paid',     owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'av',        'Sound & AV',                  180000, '2026-06-01', sup_apex,    'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'photography','Photography',                120000, '2026-06-01', sup_lens,    'approved', owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'stationery','Menus & Programmes',           45000, '2026-06-10', sup_print,   'approved', owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_guests
  (id, workspace_id, event_id, first_name, last_name, full_name, email, company, segment, rsvp_status, attendance_mode, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_gala, 'Lord Edmund', 'Grannit',  'Lord Edmund Grannit',  'lord.grannit@grannit.co.uk', 'Grannit Holdings', 'vip',      'confirmed', 'in_person', owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Clara',       'de Vos',   'Clara de Vos',         'c.devos@grannit.co.uk',      'Grannit Holdings', 'vip',      'confirmed', 'in_person', owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Sir Richard', 'Holt',     'Sir Richard Holt',     'r.holt@holdingscorp.co.uk',  'Holt & Partners',  'sponsor',  'confirmed', 'in_person', owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Diana',       'Forsythe', 'Diana Forsythe',       'd.forsythe@mediafund.com',   'Media Investment', 'customer', 'confirmed', 'in_person', owner_id),
  (gen_random_uuid(), ws_id, ev_gala, 'Oliver',      'Blackwood','Oliver Blackwood',     'o.blackwood@atlas.co.uk',    'Atlas Capital',    'customer', 'pending',   'in_person', owner_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.event_activity
  (id, workspace_id, event_id, action, entity_type, actor_name, description, created_at)
VALUES
  (gen_random_uuid(), ws_id, ev_gala, 'status_change', 'event',    'Jane Cooper',   'Event moved to In Delivery',                    now() - interval '3 days'),
  (gen_random_uuid(), ws_id, ev_gala, 'created',       'supplier', 'Jane Cooper',   'Gala Catering London confirmed for dinner',     now() - interval '25 days'),
  (gen_random_uuid(), ws_id, ev_gala, 'updated',       'task',     'Darrell Steward','Final invoice sent to client',                 now() - interval '4 days'),
  (gen_random_uuid(), ws_id, ev_gala, 'commented',     'event',    'Esther Howard', 'Seating plan draft shared with client for review', now() - interval '1 day')
ON CONFLICT DO NOTHING;

END$$;
