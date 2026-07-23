-- =============================================================================
-- Pulse Summit & After Dark 2026 — Demo Event Seed
-- Safe to run repeatedly: uses DO blocks with ON CONFLICT DO NOTHING / IF NOT EXISTS.
-- Requires: a real workspace_id substituted below before running.
-- =============================================================================
-- ⚠️  USAGE: Replace <WORKSPACE_ID> with a real workspace UUID before running.
-- ⚠️  ONLY run in local/dev/staging. Never overwrite production data.
-- =============================================================================

DO $$
DECLARE
  ws_id     uuid := '<WORKSPACE_ID>';   -- ← replace with real workspace UUID
  ev_id     uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  owner_id  uuid;   -- set from workspace_members below
  -- Supplier IDs (fixed so they're idempotent)
  sup_apex     uuid := 'b0000001-0000-0000-0000-000000000001';
  sup_green    uuid := 'b0000001-0000-0000-0000-000000000002';
  sup_lens     uuid := 'b0000001-0000-0000-0000-000000000003';
  sup_guard    uuid := 'b0000001-0000-0000-0000-000000000004';
  sup_floral   uuid := 'b0000001-0000-0000-0000-000000000005';
  sup_stream   uuid := 'b0000001-0000-0000-0000-000000000006';
  sup_print    uuid := 'b0000001-0000-0000-0000-000000000007';
  sup_horizon  uuid := 'b0000001-0000-0000-0000-000000000008';
  sup_roomlink uuid := 'b0000001-0000-0000-0000-000000000009';
BEGIN
  -- Pick any workspace member as the seed owner (avoids hardcoding a user UUID)
  SELECT user_id INTO owner_id
  FROM public.workspace_members
  WHERE workspace_id = ws_id
  LIMIT 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPPLIERS (global supplier records required by FK on event_suppliers)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.suppliers (id, workspace_id, name, status)
VALUES
  (sup_apex,     ws_id, 'Apex AV Productions',       'active'),
  (sup_green,    ws_id, 'Greenleaf Catering',         'active'),
  (sup_lens,     ws_id, 'LensWork Photography',       'active'),
  (sup_guard,    ws_id, 'EventGuard Security',        'active'),
  (sup_floral,   ws_id, 'Floral & Event Design Co.', 'active'),
  (sup_stream,   ws_id, 'StreamPulse Live',           'active'),
  (sup_print,    ws_id, 'Printcraft UK',              'active'),
  (sup_horizon,  ws_id, 'Horizon Cleaning Services',  'active'),
  (sup_roomlink, ws_id, 'RoomLink AV Hire',           'active')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- MAIN EVENT
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO events (
  id, workspace_id, name, slug, status, event_type, event_format,
  start_at, end_at,
  venue_name_snapshot, venue_address_snapshot,
  guest_count_day, capacity_online,
  budget_cents, currency,
  client_name, client_email, client_phone,
  description, objectives, brief_notes,
  is_public, is_ticketed, is_vip, is_hybrid,
  tags,
  cover_image_url,
  created_by,
  created_at, updated_at
) VALUES (
  ev_id, ws_id,
  'Pulse Summit & After Dark 2026',
  'pulse-summit-after-dark-2026',
  'confirmed',
  'conference',
  'hybrid',
  '2026-09-18 09:00:00+01',
  '2026-09-20 23:59:00+01',
  'ExCeL London',
  'Royal Victoria Dock, London E16 1XL',
  2500, 2500,
  42000000,  -- £420,000 budget
  'GBP',
  'Pulse Events Ltd',
  'james.taylor@pulseevents.co.uk',
  '+44 7900 123456',
  'Three-day hybrid conference & evening gala blending keynotes, workshops, and networking for 5,000 global attendees.',
  'Showcase UK tech leadership · Drive 500 qualified B2B leads · Generate £2M press coverage · Deliver 4.5★ NPS',
  'Corporate premium tone. Full AV production. VIP dinner night 2. After Dark party night 3. All catering vegan-first.',
  true, true, true, true,
  ARRAY['corporate','tech','hybrid','vip','ticketed','live','large-scale'],
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1920&q=80',
  owner_id,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Ensure cover_image_url is set even if the event row already existed
UPDATE events
SET cover_image_url = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1920&q=80',
    updated_at = now()
WHERE id = ev_id AND (cover_image_url IS NULL OR cover_image_url = '');

-- ─────────────────────────────────────────────────────────────────────────────
-- RUN SHEET ITEMS
-- Columns: starts_at (timestamptz), duration_minutes (int), lane (enum: tech|foh|talent|comms|security|catering|other)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO event_run_sheet_items (id, workspace_id, event_id, section, title, starts_at, duration_minutes, lane, notes, position)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Registration & Opening', 'Doors Open / Registration',         '2026-09-18 08:00:00+01', 90,  'other',    'All exhibitor stands live by 07:45', 1),
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Registration & Opening', 'Welcome Address — CEO Keynote',      '2026-09-18 09:30:00+01', 45,  'foh',      'James Taylor on stage. Intro video runs first.', 2),
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Keynotes',               'Keynote: The Future of AI in Business','2026-09-18 10:15:00+01', 45, 'tech',     'Live-streamed to online attendees. Captions on.', 3),
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Keynotes',               'Coffee Break & Networking',           '2026-09-18 11:00:00+01', 30,  'catering', 'Barista stations in North Hall.', 4),
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Keynotes',               'Panel: Scaling Startups in a Downturn','2026-09-18 11:30:00+01', 60, 'foh',      '5 panellists. MC to manage Q&A.', 5),
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Lunch',                  'Lunch Service',                       '2026-09-18 12:30:00+01', 90,  'catering', 'Vegan-first buffet. Allergen cards on all stations.', 6),
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Afternoon',              'Workshop Tracks: 3 Parallel Sessions', '2026-09-18 14:00:00+01', 120, 'tech',     'Rooms A, B, C. AV tech in each.', 7),
  (gen_random_uuid(), ws_id, ev_id, 'Day 1 — Evening',                'VIP Welcome Reception',               '2026-09-18 18:00:00+01', 120, 'foh',      'Sky Suite Level 3. Invitation only.', 8),
  (gen_random_uuid(), ws_id, ev_id, 'Day 2 — Morning',                'Doors Open Day 2',                    '2026-09-19 08:30:00+01', 30,  'other',    '', 9),
  (gen_random_uuid(), ws_id, ev_id, 'Day 2 — Morning',                'Industry Keynotes: Series B',         '2026-09-19 09:00:00+01', 90,  'tech',     'Investor panel keynote.', 10),
  (gen_random_uuid(), ws_id, ev_id, 'Day 2 — Morning',                'Break & Exhibition Floor Open',       '2026-09-19 10:30:00+01', 30,  'catering', '', 11),
  (gen_random_uuid(), ws_id, ev_id, 'Day 2 — VIP Dinner',             'VIP Gala Dinner',                     '2026-09-19 19:00:00+01', 210, 'foh',      '300 covers. Black tie. Full table service.', 12),
  (gen_random_uuid(), ws_id, ev_id, 'Day 3 — Final Day',              'Final Keynote: Year in Review',       '2026-09-20 09:30:00+01', 60,  'tech',     '', 13),
  (gen_random_uuid(), ws_id, ev_id, 'Day 3 — Final Day',              'Closing Panel & Awards',              '2026-09-20 10:30:00+01', 90,  'foh',      'Awards ceremony. 8 categories.', 14),
  (gen_random_uuid(), ws_id, ev_id, 'Day 3 — After Dark',             'After Dark Party Opens',              '2026-09-20 20:00:00+01', 300, 'other',    'DJ sets, open bar, light catering.', 15)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPPLIERS (event_suppliers join table)
-- Idempotent: delete this event's rows first so re-runs don't duplicate entries.
-- Actual schema columns: supplier_name (NOT NULL), role, status, contact_name,
--   contact_email, contact_phone. Valid statuses: pending / confirmed /
--   contracted / invoiced / paid / cancelled.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM public.event_suppliers WHERE event_id = ev_id AND workspace_id = ws_id;

INSERT INTO public.event_suppliers
  (id, workspace_id, event_id, supplier_id, supplier_name, role, status,
   contract_value_cents, contact_name, contact_email, notes)
VALUES
  (gen_random_uuid(), ws_id, ev_id, sup_apex,     'Apex AV Productions',       'AV & Technical Production',   'confirmed',  1850000, 'Liam Carter',  'liam@apexav.co.uk',      'Full rig, IMAG, LED, streaming.'),
  (gen_random_uuid(), ws_id, ev_id, sup_green,    'Greenleaf Catering',         'Catering',                    'confirmed',  1200000, 'Sarah Patel',  'sarah@greenleaf.co.uk',  'Vegan-first. 3 meals + 4 breaks per day.'),
  (gen_random_uuid(), ws_id, ev_id, sup_lens,     'LensWork Photography',       'Photography',                 'confirmed',   180000, 'Nia Brown',    'nia@lenswork.co.uk',     'Full event coverage + edited pack 72h.'),
  (gen_random_uuid(), ws_id, ev_id, sup_guard,    'EventGuard Security',        'Security & Crowd Management', 'confirmed',   320000, 'Dave Moss',    'dave@eventguard.co.uk',  '45 staff + 4 supervisors per day.'),
  (gen_random_uuid(), ws_id, ev_id, sup_floral,   'Floral & Event Design Co.', 'Décor & Floral',              'confirmed',   280000, 'Amara Diallo', 'amara@fedral.co.uk',     'Stage, VIP lounge, gala tables.'),
  (gen_random_uuid(), ws_id, ev_id, sup_stream,   'StreamPulse Live',           'Online Streaming Platform',   'confirmed',   145000, 'Tom Hayes',    'tom@streampulse.io',     'Up to 2,500 concurrent viewers.'),
  (gen_random_uuid(), ws_id, ev_id, sup_print,    'Printcraft UK',              'Print & Signage',             'confirmed',    62000, 'Beth Yates',   'beth@printcraft.co.uk',  'Banners, lanyards, programmes, badges.'),
  (gen_random_uuid(), ws_id, ev_id, sup_horizon,  'Horizon Cleaning Services',  'Venue Cleaning',              'shortlisted',  48000, 'Mark Lee',     'mark@horizoncs.co.uk',   'Pre-event + post-event deep clean.'),
  (gen_random_uuid(), ws_id, ev_id, sup_roomlink, 'RoomLink AV Hire',           'AV Equipment Hire',           'shortlisted',  74000, 'Jake Osei',    'jake@roomlink.co.uk',    'Breakout room AV — 6 rooms.')
;

-- ─────────────────────────────────────────────────────────────────────────────
-- TASKS
-- Columns: due_at (timestamptz), description (text) — no due_date, no department column
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO event_tasks (id, workspace_id, event_id, title, status, priority, due_at, description, created_by)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'Confirm final headcount with ExCeL venue',          'completed',   'high',   '2026-08-01 17:00:00+01', 'Logistics — venue ops',           owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Sign off all supplier contracts',                   'in_progress', 'high',   '2026-08-15 17:00:00+01', 'Ops — procurement',               owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Send Wave 2 guest invitations',                     'not_started', 'high',   '2026-08-10 17:00:00+01', 'Comms — guest management',        owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Confirm AV rig specifications with Apex AV',        'in_progress', 'high',   '2026-08-20 17:00:00+01', 'AV & technical production',       owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Finalise VIP gala dinner menu with Greenleaf',      'not_started', 'medium', '2026-08-25 17:00:00+01', 'Catering — VIP dinner',           owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Upload press pack to Documents',                    'completed',   'medium', '2026-07-20 17:00:00+01', 'PR & media',                      owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Book photographer briefing call',                   'completed',   'low',    '2026-08-01 17:00:00+01', 'PR — media assets',               owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Prepare post-event survey template',                'not_started', 'low',    '2026-09-10 17:00:00+01', 'Ops — post-event',                owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Review and approve After Dark DJ rider',            'not_started', 'medium', '2026-08-30 17:00:00+01', 'Ops — entertainment',             owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Confirm streaming platform integration test',       'not_started', 'high',   '2026-09-05 17:00:00+01', 'AV — online broadcast',           owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Send joining instructions to speakers',             'in_progress', 'high',   '2026-08-25 17:00:00+01', 'Comms — speaker management',      owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Arrange transport for VIP guests — night 2',        'not_started', 'medium', '2026-09-01 17:00:00+01', 'Logistics — VIP transport',       owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Complete staff briefing packs',                     'in_progress', 'high',   '2026-09-10 17:00:00+01', 'Ops — staffing',                  owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Finalise floor plan with ExCeL ops team',           'completed',   'high',   '2026-08-05 17:00:00+01', 'Logistics — venue layout',        owner_id),
  (gen_random_uuid(), ws_id, ev_id, 'Order lanyards and printed badges from Printcraft', 'completed',   'low',    '2026-08-10 17:00:00+01', 'Ops — print & branding',          owner_id)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXPENSES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO event_expenses (id, workspace_id, event_id, category, description, amount_cents, expense_date, supplier_id, status)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'av',           'AV Production - Deposit 50%',       600000, '2026-07-01', sup_apex,    'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'catering',     'Catering Deposit 30%',              255000, '2026-07-05', sup_green,   'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'venue',        'Venue Hire - ExCeL London',        1800000, '2026-06-15', NULL,        'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'security',     'Security Services Full Event',      220000, '2026-08-01', sup_guard,   'pending'),
  (gen_random_uuid(), ws_id, ev_id, 'print',        'Print & Signage Full Order',         62000, '2026-07-20', sup_print,   'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'media',        'Photography - 50% Deposit',          90000, '2026-07-15', sup_lens,    'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'tech',         'Streaming Platform Licence',        145000, '2026-06-30', sup_stream,  'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'decor',        'Décor & Floral - Full',              95000, '2026-08-20', sup_floral,  'pending'),
  (gen_random_uuid(), ws_id, ev_id, 'catering',     'VIP Gala Dinner Drinks',             45000, '2026-08-25', sup_green,   'draft'),
  (gen_random_uuid(), ws_id, ev_id, 'ops',          'Staff Uniforms & Lanyards',          12500, '2026-07-30', sup_print,   'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'speakers',     'Speaker Travel Reimbursements',      28000, '2026-09-01', NULL,        'draft'),
  (gen_random_uuid(), ws_id, ev_id, 'marketing',    'Marketing Campaign - Digital',      185000, '2026-06-01', NULL,        'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'marketing',    'Social Media Content Production',    35000, '2026-07-01', NULL,        'approved'),
  (gen_random_uuid(), ws_id, ev_id, 'entertainment','After Dark DJ & Entertainment',     120000, '2026-08-15', NULL,        'pending')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- TICKET TYPES
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ticket_types (id, workspace_id, event_id, name, price_cents, quantity, sold, status)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'General Admission (Onsite)',  19900, 1200,  980, 'on_sale'),
  (gen_random_uuid(), ws_id, ev_id, 'Business Pass (3 days)',      39900,  600,  487, 'on_sale'),
  (gen_random_uuid(), ws_id, ev_id, 'VIP All-Access',              89900,  200,   88, 'on_sale'),
  (gen_random_uuid(), ws_id, ev_id, 'VIP Gala Dinner Add-on',      29900,  300,  142, 'on_sale'),
  (gen_random_uuid(), ws_id, ev_id, 'Online Stream Only',           9900, 2500, 1850, 'on_sale'),
  (gen_random_uuid(), ws_id, ev_id, 'After Dark Party Only',       14900,  500,  318, 'on_sale'),
  (gen_random_uuid(), ws_id, ev_id, 'Exhibitor / Speaker Pass',        0,  100,   62, 'draft')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- GUESTS (sample 15)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO event_guests (id, workspace_id, event_id, first_name, last_name, email, rsvp_status, dietary_notes)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'Amelia',   'Chen',        'a.chen@horizontech.io',       'confirmed', 'Vegan'),
  (gen_random_uuid(), ws_id, ev_id, 'Daniel',   'O''Brien',    'd.obrien@pinnaclevc.co.uk',   'confirmed', 'Gluten free'),
  (gen_random_uuid(), ws_id, ev_id, 'Sophie',   'Laurent',     's.laurent@eurobiz.fr',        'confirmed', NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Raj',      'Mehta',       'r.mehta@nxtscale.in',         'confirmed', 'Vegetarian'),
  (gen_random_uuid(), ws_id, ev_id, 'Fiona',    'Walsh',       'f.walsh@techinsider.co.uk',   'confirmed', NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Marcus',   'Wright',      'm.wright@quantumleap.io',     'confirmed', NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Zainab',   'Al-Farsi',    'z.alfarsi@gulfdigital.ae',    'confirmed', 'Halal'),
  (gen_random_uuid(), ws_id, ev_id, 'Luca',     'Ferrari',     'l.ferrari@milancap.it',       'pending',   NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Priya',    'Sharma',      'p.sharma@innovateindia.in',   'pending',   'Vegetarian'),
  (gen_random_uuid(), ws_id, ev_id, 'Tom',      'Blackwell',   't.blackwell@iotp.co.uk',      'declined',  NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Naomi',    'Adeyemi',     'n.adeyemi@afretech.com',      'confirmed', 'Vegan'),
  (gen_random_uuid(), ws_id, ev_id, 'Wei',      'Zhang',       'w.zhang@sino-ventures.cn',    'confirmed', NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Emma',     'Davies',      'e.davies@brightondigital.uk', 'confirmed', NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Carlos',   'Rivera',      'c.rivera@latamtechx.mx',      'pending',   NULL),
  (gen_random_uuid(), ws_id, ev_id, 'Ingrid',   'Johansson',   'i.johansson@nordic.se',       'confirmed', 'Gluten free')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- LOGISTICS (event_logistics — only exists after 20260630_event_core_tables migration)
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN
  INSERT INTO event_logistics (id, workspace_id, event_id, item_type, title, supplier_name, status, scheduled_date, access_time, zone, quantity, notes)
  VALUES
    (gen_random_uuid(), ws_id, ev_id, 'delivery',  'AV Equipment — Stage Rig',            'Apex AV Productions',       'confirmed', '2026-09-17', '06:00', 'main_stage', 1,  'Full day rig build. Crew of 8.'),
    (gen_random_uuid(), ws_id, ev_id, 'delivery',  'Catering Equipment & Cold Storage',   'Greenleaf Catering',        'confirmed', '2026-09-17', '08:00', 'catering',   1,  'Delivery via loading bay 3.'),
    (gen_random_uuid(), ws_id, ev_id, 'delivery',  'Print & Signage — All items',         'Printcraft UK',             'in_transit','2026-09-17', '09:00', 'registration',1, 'Banners, stands, badge boards.'),
    (gen_random_uuid(), ws_id, ev_id, 'delivery',  'Décor & Floral Arrangements',         'Floral & Event Design Co.', 'pending',   '2026-09-18', '07:00', 'vip',        1,  'Stage + VIP lounge install.'),
    (gen_random_uuid(), ws_id, ev_id, 'collection','Post-Event AV De-rig',                'Apex AV Productions',       'pending',   '2026-09-21', '08:00', 'main_stage', 1,  'De-rig day after close.'),
    (gen_random_uuid(), ws_id, ev_id, 'transport', 'VIP Guest Shuttles — Night 2',        'Premier Cars London',       'pending',   '2026-09-19', '18:30', 'entrance',   8,  '8 vehicles from St Pancras.'),
    (gen_random_uuid(), ws_id, ev_id, 'delivery',  'Breakout AV Equipment (Rooms A-C)',   'RoomLink AV Hire',          'pending',   '2026-09-17', '10:00', 'breakout',   3,  '1 screen + PA per room.'),
    (gen_random_uuid(), ws_id, ev_id, 'delivery',  'Registration Kiosks (x6)',            'EventTech Systems',         'confirmed', '2026-09-17', '14:00', 'registration',6, 'Self-service badge print kiosks.')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'event_logistics table does not exist yet — run 20260630_event_core_tables migration first.';
END;

-- ─────────────────────────────────────────────────────────────────────────────
-- STAFFING  (uses event_staff_assignments table from L11-15 migration)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO event_staff_assignments (id, workspace_id, event_id, staff_name, role, notes)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'James Taylor',     'Event Director',         'Overall lead.'),
  (gen_random_uuid(), ws_id, ev_id, 'Sophie Morgan',    'Operations Manager',     'Day-of logistics lead.'),
  (gen_random_uuid(), ws_id, ev_id, 'Ryan Osei',        'AV Director',            'Apex AV liaison.'),
  (gen_random_uuid(), ws_id, ev_id, 'Priya Kapoor',     'Guest Relations Lead',   'Manages registration team.'),
  (gen_random_uuid(), ws_id, ev_id, 'Ben Williams',     'VIP Host',               'VIP lounge and gala dinner.'),
  (gen_random_uuid(), ws_id, ev_id, 'Jade Thompson',    'Social Media Manager',   'Live content all 3 days.'),
  (gen_random_uuid(), ws_id, ev_id, 'Kofi Mensah',      'Security Supervisor',    'EventGuard lead.'),
  (gen_random_uuid(), ws_id, ev_id, 'Alicia Nkosi',     'Speaker Liaison',        'Green room management.'),
  (gen_random_uuid(), ws_id, ev_id, 'Harry Blake',      'Registration Assistant', ''),
  (gen_random_uuid(), ws_id, ev_id, 'Chloe Pearce',     'Registration Assistant', ''),
  (gen_random_uuid(), ws_id, ev_id, 'Sam Okonkwo',      'Streaming Tech',         'StreamPulse liaison.'),
  (gen_random_uuid(), ws_id, ev_id, 'Lucy Chen',        'After Dark Coordinator', 'Night 3 only.')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOCUMENTS (stored in event_files — caption holds uploader name, tags hold category)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO event_files (id, workspace_id, event_id, filename, mime_type, tags, size_bytes, uploaded_by, caption, storage_key)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'Pulse Summit 2026 Event Brief v3.pdf',        'application/pdf',                                                          ARRAY['brief'],      2048000, owner_id, 'James Taylor',  'events/' || ev_id || '/brief/pulse-brief-v3.pdf'),
  (gen_random_uuid(), ws_id, ev_id, 'ExCeL Floor Plan — South Hall B+C.pdf',       'application/pdf',                                                          ARRAY['floor_plan'],  876000, owner_id, 'Sophie Morgan', 'events/' || ev_id || '/floor-plans/excel-south-bc.pdf'),
  (gen_random_uuid(), ws_id, ev_id, 'Apex AV Contract — Signed.pdf',               'application/pdf',                                                          ARRAY['contract'],   1560000, owner_id, 'James Taylor',  'events/' || ev_id || '/contracts/apex-av-signed.pdf'),
  (gen_random_uuid(), ws_id, ev_id, 'Greenleaf Catering Proposal v2.pdf',          'application/pdf',                                                          ARRAY['proposal'],    990000, owner_id, 'Sophie Morgan', 'events/' || ev_id || '/proposals/greenleaf-v2.pdf'),
  (gen_random_uuid(), ws_id, ev_id, 'Press Pack — Pulse Summit 2026.zip',          'application/zip',                                                          ARRAY['media'],      8400000, owner_id, 'Jade Thompson', 'events/' || ev_id || '/media/press-pack.zip'),
  (gen_random_uuid(), ws_id, ev_id, 'Pulse Summit Hero Image — 4K.jpg',            'image/jpeg',                                                               ARRAY['media'],      4200000, owner_id, 'Jade Thompson', 'events/' || ev_id || '/media/hero-4k.jpg'),
  (gen_random_uuid(), ws_id, ev_id, 'VIP Gala Dinner Menu — Draft.pdf',            'application/pdf',                                                          ARRAY['proposal'],    420000, owner_id, 'Sophie Morgan', 'events/' || ev_id || '/proposals/vip-menu-draft.pdf'),
  (gen_random_uuid(), ws_id, ev_id, 'Stage & Screen Layout — Keynote Hall.png',    'image/png',                                                                ARRAY['floor_plan'], 1100000, owner_id, 'Ryan Osei',     'events/' || ev_id || '/floor-plans/stage-layout.png'),
  (gen_random_uuid(), ws_id, ev_id, 'Speaker Briefing Pack.pdf',                   'application/pdf',                                                          ARRAY['brief'],       780000, owner_id, 'Alicia Nkosi',  'events/' || ev_id || '/brief/speaker-pack.pdf'),
  (gen_random_uuid(), ws_id, ev_id, 'Budget Tracker v4.xlsx',                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        ARRAY['report'],      220000, owner_id, 'James Taylor',  'events/' || ev_id || '/reports/budget-v4.xlsx')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMS (event_comms table — only exists after 20260630_event_core_tables migration)
-- Wrapped in exception block so seed runs cleanly even before migration.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN
  INSERT INTO event_comms (id, workspace_id, event_id, subject, channel, recipient_name, recipient_type, status, direction, body_preview, sent_at)
  VALUES
    (gen_random_uuid(), ws_id, ev_id, 'Welcome to Pulse Summit 2026!',              'email',  'All Confirmed Guests',   'guest_group',    'sent',    'outbound', 'Your registration is confirmed. Here''s everything you need to know before the event...', now() - interval '30 days'),
    (gen_random_uuid(), ws_id, ev_id, 'VIP Gala Dinner — Your Invitation',          'email',  'VIP Guests',             'vip_group',      'sent',    'outbound', 'You are cordially invited to the exclusive VIP Gala Dinner on the evening of 19 September...', now() - interval '25 days'),
    (gen_random_uuid(), ws_id, ev_id, 'Speaker Joining Instructions',               'email',  'All Confirmed Speakers', 'speaker_group',  'sent',    'outbound', 'Please find attached your speaker pack, AV requirements form and green room schedule...', now() - interval '20 days'),
    (gen_random_uuid(), ws_id, ev_id, 'Pulse Summit — 4 Weeks to Go!',              'email',  'All Registered Guests',  'guest_group',    'sent',    'outbound', 'It''s nearly time! Here''s a quick update on what to expect and how to prepare...', now() - interval '10 days'),
    (gen_random_uuid(), ws_id, ev_id, 'Supplier Contract — AV Production',          'email',  'Liam Carter (Apex AV)',  'supplier',       'sent',    'outbound', 'Please find attached the countersigned AV production agreement for Pulse Summit 2026...', now() - interval '45 days'),
    (gen_random_uuid(), ws_id, ev_id, 'Re: Catering Menu Changes',                  'email',  'Sarah Patel (Greenleaf)','supplier',       'read',    'inbound',  'Happy to update the evening menu — can we have a call Thursday to confirm final selections?', now() - interval '8 days'),
    (gen_random_uuid(), ws_id, ev_id, 'After Dark — DJ Rider Attached',             'email',  'Events Team',            'internal',       'sent',    'inbound',  'Please find the rider for After Dark. The DJ requires specific monitoring setup...', now() - interval '5 days'),
    (gen_random_uuid(), ws_id, ev_id, 'Wave 2 Guest Invite — DRAFT',                'email',  'All Invited (Wave 2)',   'guest_group',    'draft',   'outbound', 'You''ve been personally invited to join us at Pulse Summit 2026...', null)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'event_comms table does not exist yet — run 20260630_event_core_tables migration first.';
END;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVITY
-- Columns: action, resource_type, note, actor_name, created_at (no action_type/entity_type/entity_label/description)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO event_activity (id, workspace_id, event_id, action, resource_type, note, actor_name, created_at)
VALUES
  (gen_random_uuid(), ws_id, ev_id, 'created',       'event',    'Event created and status set to Confirmed.',                    'James Taylor',  now() - interval '60 days'),
  (gen_random_uuid(), ws_id, ev_id, 'uploaded',      'document', 'Uploaded Event Brief v3.pdf to Documents.',                    'James Taylor',  now() - interval '55 days'),
  (gen_random_uuid(), ws_id, ev_id, 'created',       'supplier', 'Apex AV Productions added as AV & Technical Production.',      'Sophie Morgan', now() - interval '50 days'),
  (gen_random_uuid(), ws_id, ev_id, 'status_change', 'supplier', 'Apex AV contract status changed to Confirmed.',                'James Taylor',  now() - interval '45 days'),
  (gen_random_uuid(), ws_id, ev_id, 'sent',          'comms',    'Contract email sent to Liam Carter at Apex AV.',               'James Taylor',  now() - interval '45 days'),
  (gen_random_uuid(), ws_id, ev_id, 'created',       'task',     'Task created: Sign off all supplier contracts.',               'Sophie Morgan', now() - interval '40 days'),
  (gen_random_uuid(), ws_id, ev_id, 'sent',          'comms',    'Welcome email sent to all 1,847 confirmed guests.',            'Jade Thompson', now() - interval '30 days'),
  (gen_random_uuid(), ws_id, ev_id, 'uploaded',      'document', 'Budget tracker updated to v4.',                                'James Taylor',  now() - interval '20 days'),
  (gen_random_uuid(), ws_id, ev_id, 'updated',       'event',    'Catering briefing notes updated.',                             'Sophie Morgan', now() - interval '12 days'),
  (gen_random_uuid(), ws_id, ev_id, 'created',       'guest',    'Amelia Chen (Horizon Tech) registered as VIP guest.',          'Priya Kapoor',  now() - interval '10 days'),
  (gen_random_uuid(), ws_id, ev_id, 'commented',     'task',     'Left comment: Greenleaf confirmed vegan amuse-bouche option.',  'Sophie Morgan', now() - interval '8 days'),
  (gen_random_uuid(), ws_id, ev_id, 'status_change', 'task',     'Floor plan task marked as Completed.',                         'James Taylor',  now() - interval '5 days'),
  (gen_random_uuid(), ws_id, ev_id, 'updated',       'supplier', 'Print supplier status updated to Confirmed.',                  'Sophie Morgan', now() - interval '3 days'),
  (gen_random_uuid(), ws_id, ev_id, 'created',       'logistics','AV stage rig logistics item added, confirmed for 17 Sep.',     'Ryan Osei',     now() - interval '2 days'),
  (gen_random_uuid(), ws_id, ev_id, 'uploaded',      'document', 'Speaker briefing pack uploaded.',                              'Alicia Nkosi',  now() - interval '1 day')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- ZONES (event_zones — only exists after 20260630_event_core_tables migration)
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN
  INSERT INTO event_zones (id, workspace_id, event_id, zone_type, name, capacity, current_occupancy, status, notes)
  VALUES
    (gen_random_uuid(), ws_id, ev_id, 'main_stage',   'Main Stage Hall',       2000, 0, 'active',   'Primary keynote and panel stage.'),
    (gen_random_uuid(), ws_id, ev_id, 'registration', 'Registration Lobby',     500, 0, 'active',   '6 self-serve kiosks + 4 staffed desks.'),
    (gen_random_uuid(), ws_id, ev_id, 'vip',          'VIP Lounge',             150, 0, 'active',   'Access: VIP All-Access badge only.'),
    (gen_random_uuid(), ws_id, ev_id, 'catering',     'Catering Zone',          600, 0, 'active',   'Buffet + barista stations.'),
    (gen_random_uuid(), ws_id, ev_id, 'exhibition',   'Exhibition Floor',      1000, 0, 'active',   '28 exhibitor stands.'),
    (gen_random_uuid(), ws_id, ev_id, 'breakout',     'Breakout Rooms A-C',     150, 0, 'active',   '50 per room, 3 rooms.'),
    (gen_random_uuid(), ws_id, ev_id, 'backstage',    'Green Room / Backstage',  50, 0, 'inactive', 'Speakers and crew only.'),
    (gen_random_uuid(), ws_id, ev_id, 'networking',   'Networking Hub',          300, 0, 'active',   'Open throughout event days.')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'event_zones table does not exist yet — run 20260630_event_core_tables migration first.';
END;

END $$;
