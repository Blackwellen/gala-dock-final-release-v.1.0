-- =============================================================================
-- GALA DOCK — Events Section Demo Seed
-- Run in Supabase SQL Editor (one click → Run).
-- Self-contained: uses the first workspace and your account email.
-- =============================================================================

DO $$
DECLARE
  v_ws   uuid;
  v_user uuid;

  -- Event UUIDs
  e1  uuid := gen_random_uuid();
  e2  uuid := gen_random_uuid();
  e3  uuid := gen_random_uuid();
  e4  uuid := gen_random_uuid();
  e5  uuid := gen_random_uuid();
  e6  uuid := gen_random_uuid();
  e7  uuid := gen_random_uuid();
  e8  uuid := gen_random_uuid();
  e9  uuid := gen_random_uuid();
  e10 uuid := gen_random_uuid();
  e11 uuid := gen_random_uuid();
  e12 uuid := gen_random_uuid();
  e13 uuid := gen_random_uuid();
  e14 uuid := gen_random_uuid();
  e15 uuid := gen_random_uuid();

  -- Supplier UUIDs
  s1  uuid := gen_random_uuid();
  s2  uuid := gen_random_uuid();
  s3  uuid := gen_random_uuid();
  s4  uuid := gen_random_uuid();
  s5  uuid := gen_random_uuid();
  s6  uuid := gen_random_uuid();
  s7  uuid := gen_random_uuid();
  s8  uuid := gen_random_uuid();
  s9  uuid := gen_random_uuid();
  s10 uuid := gen_random_uuid();

BEGIN
  -- ── resolve workspace & user ──────────────────────────────────────────────
  SELECT id INTO v_ws FROM public.workspaces LIMIT 1;
  SELECT id INTO v_user FROM auth.users WHERE email = 'jamahlthomas1996@gmail.com' LIMIT 1;
  IF v_user IS NULL THEN SELECT id INTO v_user FROM auth.users LIMIT 1; END IF;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'No workspace found — create a workspace first.'; END IF;

  -- ==========================================================================
  -- 1. EVENTS
  -- cover_path = Unsplash CDN URLs (no API key needed, serve directly)
  -- All 9 pipeline stages represented across 15 events
  -- ==========================================================================

  INSERT INTO public.events (
    id, workspace_id, name, status, event_type,
    start_at, end_at,
    venue_name_snapshot, location,
    guest_count_day, guest_count_evening,
    budget_cents, client_name, client_company,
    owner_user_id, risk_level, cover_path,
    flagged, created_by, updated_by, notes
  ) VALUES

  -- Stage: new_enquiry ───────────────────────────────────────────────────────
  (e1, v_ws, 'London Tech Summit 2026', 'new_enquiry', 'conference',
   NOW() + INTERVAL '90 days', NOW() + INTERVAL '91 days',
   'ExCeL London', 'Royal Docks, London E16',
   850, 0, 24000000, 'James Whitfield', 'TechVenture UK Ltd',
   v_user, 'low',
   'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
   false, v_user, v_user,
   'Annual tech summit. Client keen on hybrid streaming option. Needs AV quote by week 3.'),

  (e2, v_ws, 'The Robertson Wedding', 'new_enquiry', 'wedding',
   NOW() + INTERVAL '120 days', NOW() + INTERVAL '120 days',
   'Blenheim Palace', 'Woodstock, Oxfordshire OX20',
   180, 320, 8500000, 'Sarah & Tom Robertson', NULL,
   v_user, 'low',
   'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800&q=80',
   false, v_user, v_user,
   'Marquee wedding in palace grounds. Awaiting site visit confirmation.'),

  -- Stage: briefing ──────────────────────────────────────────────────────────
  (e3, v_ws, 'Meridian Corporate Gala 2026', 'briefing', 'gala_dinner',
   NOW() + INTERVAL '60 days', NOW() + INTERVAL '60 days',
   'The Grosvenor House Hotel', 'Park Lane, London W1K',
   0, 500, 15000000, 'Priya Sharma', 'Meridian Financial Group',
   v_user, 'medium',
   'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&q=80',
   false, v_user, v_user,
   'Black-tie annual gala. Client wants sustainability theme. Brief call booked for Thursday.'),

  (e4, v_ws, 'Latitude Festival Brand Activation', 'briefing', 'festival',
   NOW() + INTERVAL '45 days', NOW() + INTERVAL '48 days',
   'Henham Park', 'Southwold, Suffolk IP17',
   0, 12000, 38000000, 'Oliver Grant', 'Nova Brands Agency',
   v_user, 'high',
   'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
   true, v_user, v_user,
   'Brand activation across 3 stages. Flagged: tight turnaround, complex logistics.'),

  -- Stage: quoting ───────────────────────────────────────────────────────────
  (e5, v_ws, 'Nationwide Property Awards 2026', 'quoting', 'awards_ceremony',
   NOW() + INTERVAL '55 days', NOW() + INTERVAL '55 days',
   'The O2 Arena', 'Peninsula Square, London SE10',
   0, 2200, 42000000, 'Marcus Bell', 'Nationwide Property Group',
   v_user, 'medium',
   'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&q=80',
   false, v_user, v_user,
   'Major industry awards. Quote due Friday. AV and catering still outstanding.'),

  (e6, v_ws, 'Future Leaders Summit', 'quoting', 'conference',
   NOW() + INTERVAL '75 days', NOW() + INTERVAL '76 days',
   'The Brewery', '52 Chiswell Street, London EC1Y',
   600, 0, 9500000, 'Dr Amelia Hughes', 'The Bloom Foundation',
   v_user, 'low',
   'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80',
   false, v_user, v_user,
   'Two-day leadership conference for 18–30 cohort. Quote v2 in progress.'),

  -- Stage: awaiting_approval ─────────────────────────────────────────────────
  (e7, v_ws, 'Apex Financial Retreat', 'awaiting_approval', 'corporate_retreat',
   NOW() + INTERVAL '35 days', NOW() + INTERVAL '38 days',
   'Gleneagles Hotel', 'Auchterarder, Perthshire PH3',
   120, 0, 22000000, 'Charlotte Davies', 'Apex Capital Partners',
   v_user, 'medium',
   'https://images.unsplash.com/photo-1565302240832-9d6543a0ebc3?w=800&q=80',
   true, v_user, v_user,
   'VIP retreat. Quote submitted. Awaiting board sign-off. High value — handle personally.'),

  (e8, v_ws, 'Covent Garden Christmas Markets', 'awaiting_approval', 'pop_up',
   NOW() + INTERVAL '165 days', NOW() + INTERVAL '180 days',
   'Covent Garden Piazza', 'London WC2E',
   0, 50000, 7800000, 'Gemma Thornton', 'LDN Markets Ltd',
   v_user, 'low',
   'https://images.unsplash.com/photo-1544006659-f0b21884ce1d?w=800&q=80',
   false, v_user, v_user,
   'Seasonal market. 15-night run. Awaiting venue licence approval from GLA.'),

  -- Stage: confirmed ─────────────────────────────────────────────────────────
  (e9, v_ws, 'The Balmoral Estate Highland Games', 'confirmed', 'sporting_event',
   NOW() + INTERVAL '28 days', NOW() + INTERVAL '28 days',
   'Balmoral Estate', 'Ballater, Aberdeenshire AB35',
   0, 3500, 18500000, 'Lord & Lady Kincaid', 'Kincaid Estate Trust',
   v_user, 'medium',
   'https://images.unsplash.com/photo-1445264457965-5e7b0878e239?w=800&q=80',
   false, v_user, v_user,
   'Traditional games + evening ceilidh. All suppliers locked. Focus on logistics now.'),

  (e10, v_ws, 'Hartley & Young Centenary Gala', 'confirmed', 'gala_dinner',
   NOW() + INTERVAL '18 days', NOW() + INTERVAL '18 days',
   'The Savoy Hotel', 'Strand, London WC2R',
   0, 420, 28000000, 'Eleanor Hartley', 'Hartley & Young LLP',
   v_user, 'high',
   'https://images.unsplash.com/photo-1502635385003-ee1e6a1a742d?w=800&q=80',
   true, v_user, v_user,
   'Centenary black-tie. VIP event. T-18 days. Final walk-through tomorrow morning.'),

  -- Stage: in_delivery ───────────────────────────────────────────────────────
  (e11, v_ws, 'Soho House Members Festival', 'in_delivery', 'festival',
   NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days',
   'Soho Farmhouse', 'Great Tew, Oxfordshire OX7',
   0, 8000, 35000000, 'Rashida Okonkwo', 'Soho House Group',
   v_user, 'high',
   'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=80',
   true, v_user, v_user,
   'LIVE NOW — multi-stage members festival. Ops on site. Check-in desk operational.'),

  (e12, v_ws, 'KPMG Innovation Summit', 'in_delivery', 'conference',
   NOW(), NOW() + INTERVAL '1 day',
   'The Barbican Centre', 'Silk Street, London EC2Y',
   1200, 0, 16000000, 'David Nguyen', 'KPMG UK',
   v_user, 'medium',
   'https://images.unsplash.com/photo-1559523161-0fc0d8b814f4?w=800&q=80',
   false, v_user, v_user,
   'LIVE NOW. Day 1 of 2. Morning keynote complete. Afternoon breakouts on schedule.'),

  -- Stage: completed ─────────────────────────────────────────────────────────
  (e13, v_ws, 'Burberry Spring Collection Preview', 'completed', 'product_launch',
   NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days',
   'Tate Modern', 'Bankside, London SE1',
   0, 600, 32000000, 'Helena Cross', 'Burberry Group plc',
   v_user, 'low',
   'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80',
   false, v_user, v_user,
   'Completed. Final settlement being prepared. Post-event report due next week.'),

  (e14, v_ws, 'Oxford Union Annual Debate 2025', 'completed', 'conference',
   NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days',
   'The Oxford Union', 'Frewin Court, Oxford OX1',
   800, 0, 4200000, 'The Oxford Union Society', NULL,
   v_user, 'low',
   'https://images.unsplash.com/photo-1507537297725-24a1c029d3ca?w=800&q=80',
   false, v_user, v_user,
   'Completed. Post-event feedback outstanding. Final invoice issued.'),

  -- Stage: cancelled ─────────────────────────────────────────────────────────
  (e15, v_ws, 'Global Fintech Forum (Cancelled)', 'cancelled', 'conference',
   NOW() + INTERVAL '10 days', NOW() + INTERVAL '11 days',
   'Canary Wharf Conference Centre', 'One Canada Square, London E14',
   0, 1800, 19000000, 'Iain Murray', 'Fintech Global Ltd',
   v_user, 'low',
   'https://images.unsplash.com/photo-1560523160-754a9e25c68f?w=800&q=80',
   false, v_user, v_user,
   'Cancelled by client due to sponsor withdrawal. Clause invoked. Final invoice sent.');

  -- ==========================================================================
  -- 2. SUPPLIERS (base records — needed for event_suppliers join)
  -- ==========================================================================

  INSERT INTO public.suppliers (
    id, workspace_id, name, primary_email, primary_phone,
    bank_account_verified, flagged, payment_terms_days, created_by
  ) VALUES
  (s1,  v_ws, 'Highland Catering Co.',    'morag@highlandcatering.co.uk',  '+44 1383 123456', false, false, 30, v_user),
  (s2,  v_ws, 'North Stage Events',       'craig@northstage.co.uk',        '+44 141 999 0000', false, false, 14, v_user),
  (s3,  v_ws, 'Eventure AV London',       'tim@eventure.co.uk',            '+44 20 7000 1111', false, false, 30, v_user),
  (s4,  v_ws, 'Flowers by Arabella',      'arabella@flowersbyarabella.com','+44 20 7000 2222', false, false, 0,  v_user),
  (s5,  v_ws, 'Maestro Entertainment',    'carlo@maestro.co.uk',           '+44 20 7000 3333', false, false, 30, v_user),
  (s6,  v_ws, 'Stage Nation',             'becky@stagenation.com',         '+44 20 7000 4444', false, false, 14, v_user),
  (s7,  v_ws, 'Greenfield Catering',      'sam@greenfield.co.uk',          '+44 1865 000555', false, false, 30, v_user),
  (s8,  v_ws, 'Glow Lighting Design',     'zoe@glowlighting.co.uk',        '+44 20 7000 6666', false, false, 14, v_user),
  (s9,  v_ws, 'TechSound AV',             'ben@techsound.co.uk',           '+44 20 7000 7777', false, false, 30, v_user),
  (s10, v_ws, 'Premier Security Scotland','john@premiersec.co.uk',         '+44 131 000 8888', false, false, 0,  v_user);

  -- ==========================================================================
  -- 3. EVENT SUPPLIERS (join table: event ↔ supplier)
  -- ==========================================================================

  INSERT INTO public.event_suppliers (event_id, workspace_id, supplier_id, status, role_on_event, created_by)
  VALUES
  (e9,  v_ws, s1,  'confirmed',   'Catering — 3,500 guests',     v_user),
  (e9,  v_ws, s2,  'confirmed',   'AV & Production',             v_user),
  (e9,  v_ws, s10, 'contacted',   'Security',                    v_user),
  (e10, v_ws, s3,  'confirmed',   'AV & Production',             v_user),
  (e10, v_ws, s4,  'confirmed',   'Floristry — 40 centrepieces', v_user),
  (e10, v_ws, s5,  'contacted',   'String quartet & DJ',         v_user),
  (e11, v_ws, s6,  'confirmed',   'Stage Production',            v_user),
  (e11, v_ws, s7,  'confirmed',   'Catering — full festival',    v_user),
  (e11, v_ws, s8,  'confirmed',   'Lighting Design',             v_user),
  (e5,  v_ws, s9,  'contacted',   'AV & Sound',                  v_user),
  (e5,  v_ws, s7,  'shortlisted', 'Catering',                    v_user),
  (e7,  v_ws, s1,  'confirmed',   'Catering — Gleneagles',       v_user);

  -- ==========================================================================
  -- 4. EVENT TASKS
  -- ==========================================================================

  INSERT INTO public.event_tasks (event_id, workspace_id, title, status, priority, due_at, created_by, position)
  VALUES
  -- Highland Games (e9) — confirmed
  (e9,  v_ws, 'Confirm catering headcount with caterer', 'completed',   'high',   NOW() - INTERVAL '5 days', v_user, 1),
  (e9,  v_ws, 'Deliver PA system to site',               'completed',   'high',   NOW() + INTERVAL '1 day',  v_user, 2),
  (e9,  v_ws, 'Brief security on VIP access zones',      'in_progress', 'high',   NOW() + INTERVAL '2 days', v_user, 3),
  (e9,  v_ws, 'Print and laminate event programmes',     'in_progress', 'medium', NOW() + INTERVAL '3 days', v_user, 4),
  (e9,  v_ws, 'Coordinate shuttle bus schedule',         'todo',        'medium', NOW() + INTERVAL '4 days', v_user, 5),
  (e9,  v_ws, 'Final walk-through with venue manager',   'todo',        'high',   NOW() + INTERVAL '5 days', v_user, 6),
  (e9,  v_ws, 'Confirm photographer arrival time',       'todo',        'low',    NOW() + INTERVAL '6 days', v_user, 7),
  (e9,  v_ws, 'Prepare awards and trophies',             'todo',        'medium', NOW() + INTERVAL '7 days', v_user, 8),

  -- Savoy Gala (e10) — confirmed VIP
  (e10, v_ws, 'Finalise seating plan',                   'completed',   'urgent', NOW() - INTERVAL '3 days', v_user, 1),
  (e10, v_ws, 'Confirm dietary requirements with kitchen','completed',  'high',   NOW() - INTERVAL '2 days', v_user, 2),
  (e10, v_ws, 'Send final guest list to Savoy security', 'in_progress', 'urgent', NOW() + INTERVAL '1 day',  v_user, 3),
  (e10, v_ws, 'Arrange VIP car park spaces',             'todo',        'high',   NOW() + INTERVAL '2 days', v_user, 4),
  (e10, v_ws, 'Print place cards and menus',             'todo',        'medium', NOW() + INTERVAL '3 days', v_user, 5),

  -- Soho House Festival (e11) — in delivery
  (e11, v_ws, 'Stage A sound check',                     'completed',   'urgent', NOW() - INTERVAL '12 hours', v_user, 1),
  (e11, v_ws, 'Artist green room setup',                 'completed',   'high',   NOW() - INTERVAL '10 hours', v_user, 2),
  (e11, v_ws, 'Bar stock replenishment at 17:00',        'in_progress', 'high',   NOW() + INTERVAL '2 hours',  v_user, 3),
  (e11, v_ws, 'Evening headliner soundcheck 18:30',      'todo',        'urgent', NOW() + INTERVAL '5 hours',  v_user, 4),
  (e11, v_ws, 'Security changeover briefing',            'todo',        'high',   NOW() + INTERVAL '4 hours',  v_user, 5),

  -- Property Awards (e5) — quoting
  (e5,  v_ws, 'Get AV quote from TechSound',             'in_progress', 'high',   NOW() + INTERVAL '3 days', v_user, 1),
  (e5,  v_ws, 'Catering quote — 3 options for client',   'todo',        'high',   NOW() + INTERVAL '5 days', v_user, 2),
  (e5,  v_ws, 'Write award categories copy',             'todo',        'medium', NOW() + INTERVAL '7 days', v_user, 3),

  -- Apex Retreat (e7) — awaiting approval
  (e7,  v_ws, 'Prepare quote breakdown document',        'completed',   'high',   NOW() - INTERVAL '7 days', v_user, 1),
  (e7,  v_ws, 'Client follow-up call',                   'in_progress', 'high',   NOW() + INTERVAL '1 day',  v_user, 2),

  -- Meridian Gala (e3) — briefing
  (e3,  v_ws, 'Prepare event brief template',            'in_progress', 'medium', NOW() + INTERVAL '7 days',  v_user, 1),
  (e3,  v_ws, 'Book sustainability consultant',          'todo',        'low',    NOW() + INTERVAL '14 days', v_user, 2),

  -- KPMG Summit (e12) — in delivery
  (e12, v_ws, 'Registration desk open',                  'completed',   'urgent', NOW() - INTERVAL '1 hour',  v_user, 1),
  (e12, v_ws, 'Keynote AV check',                        'completed',   'high',   NOW() - INTERVAL '2 hours', v_user, 2),
  (e12, v_ws, 'Afternoon breakout rooms ready',          'in_progress', 'high',   NOW() + INTERVAL '1 hour',  v_user, 3),
  (e12, v_ws, 'Evening networking drinks setup',         'todo',        'medium', NOW() + INTERVAL '5 hours', v_user, 4);

  -- ==========================================================================
  -- 5. EVENT GUESTS
  -- guest_type values: 'standard', 'vip', 'speaker', 'sponsor', 'press'
  -- ==========================================================================

  INSERT INTO public.event_guests (
    event_id, workspace_id,
    first_name, last_name, email, phone,
    rsvp_status, guest_type, table_number, dietary_notes, created_by
  ) VALUES
  -- Savoy Gala (e10) guests
  (e10, v_ws, 'Eleanor',   'Hartley',   'eleanor@hartleyyoung.com',     '+44 20 7000 0001', 'confirmed', 'vip',      'Top Table', NULL,           v_user),
  (e10, v_ws, 'Richard',   'Chadwick',  'r.chadwick@hartleyyoung.com',  '+44 20 7000 0002', 'confirmed', 'vip',      'Top Table', NULL,           v_user),
  (e10, v_ws, 'Victoria',  'St. Clare', 'vsc@partners.co.uk',           '+44 20 7000 0003', 'confirmed', 'standard', 'Table 2',   'Vegetarian',   v_user),
  (e10, v_ws, 'James',     'Pullman',   'jpullman@pullman.law',         '+44 20 7000 0004', 'confirmed', 'standard', 'Table 2',   NULL,           v_user),
  (e10, v_ws, 'Arabella',  'Whitmore',  'awhitmore@blakecroft.co.uk',   '+44 20 7000 0005', 'pending',   'standard', 'Table 3',   'Gluten-free',  v_user),
  (e10, v_ws, 'Henry',     'Cavendish', 'h.cavendish@mckinsey.com',     '+44 20 7000 0006', 'confirmed', 'vip',      'Top Table', NULL,           v_user),
  (e10, v_ws, 'Imogen',    'Blake',     'i.blake@linklaters.com',       '+44 20 7000 0007', 'confirmed', 'standard', 'Table 4',   NULL,           v_user),
  (e10, v_ws, 'Tobias',    'Fenn',      't.fenn@deloitte.com',          '+44 20 7000 0008', 'declined',  'standard', 'Table 4',   NULL,           v_user),
  -- Highland Games (e9) guests
  (e9,  v_ws, 'Duncan',    'Kincaid',   'estate@kincaid.co.uk',         '+44 1339 123456',  'confirmed', 'vip',      NULL, NULL,                  v_user),
  (e9,  v_ws, 'Fiona',     'Kincaid',   'lady@kincaid.co.uk',           '+44 1339 123457',  'confirmed', 'vip',      NULL, 'Vegan',               v_user),
  (e9,  v_ws, 'Angus',     'MacGregor', 'angus@macgregor.scot',         '+44 131 000 1234', 'confirmed', 'standard', NULL, NULL,                  v_user),
  (e9,  v_ws, 'Flora',     'Cameron',   'flora.cameron@gmail.com',      '+44 7900 000001',  'confirmed', 'standard', NULL, 'Nut allergy',         v_user),
  (e9,  v_ws, 'Douglas',   'Stirling',  'ds@stirlinglaw.co.uk',         '+44 131 000 5678', 'pending',   'standard', NULL, NULL,                  v_user),
  (e9,  v_ws, 'Catriona',  'Mackenzie', 'cmack@gmail.com',              '+44 7900 000002',  'confirmed', 'standard', NULL, NULL,                  v_user),
  -- Festival guests (e11)
  (e11, v_ws, 'Rashida',   'Okonkwo',   'r.okonkwo@sohohouse.com',      '+44 20 7000 9001', 'confirmed', 'vip',      NULL, NULL,                  v_user),
  (e11, v_ws, 'Sebastian', 'Voss',      'svoss@gmail.com',              '+44 7900 000010',  'confirmed', 'standard', NULL, NULL,                  v_user),
  (e11, v_ws, 'Naomi',     'Chen',      'naomi.chen@gmail.com',         '+44 7900 000011',  'confirmed', 'standard', NULL, 'Dairy-free',          v_user),
  -- KPMG Summit (e12)
  (e12, v_ws, 'David',     'Nguyen',    'd.nguyen@kpmg.co.uk',          '+44 20 7311 1234', 'confirmed', 'speaker',  NULL, NULL,                  v_user),
  (e12, v_ws, 'Patricia',  'Walsh',     'p.walsh@kpmg.co.uk',           '+44 20 7311 5678', 'confirmed', 'standard', NULL, 'Halal',               v_user),
  (e12, v_ws, 'Robert',    'Kim',       'robert.kim@startupx.com',      '+44 7900 000020',  'confirmed', 'sponsor',  NULL, NULL,                  v_user);

  -- ==========================================================================
  -- 6. EVENT EXPENSES
  -- ==========================================================================

  INSERT INTO public.event_expenses (
    event_id, workspace_id, description, amount_cents, category, status, expense_date, created_by
  ) VALUES
  -- Highland Games (e9)
  (e9,  v_ws, 'Catering deposit — 3,500 guests',    250000,  'catering',       'approved', NOW() - INTERVAL '14 days', v_user),
  (e9,  v_ws, 'PA system hire 3 days',               120000,  'av',             'approved', NOW() - INTERVAL '10 days', v_user),
  (e9,  v_ws, 'Tents and marquee hire',              350000,  'infrastructure', 'approved', NOW() - INTERVAL '12 days', v_user),
  (e9,  v_ws, 'Printing — programmes x 3,500',       18000,   'marketing',      'pending',  NOW() - INTERVAL '2 days',  v_user),
  -- Savoy Gala (e10)
  (e10, v_ws, 'Savoy venue hire — evening',          800000,  'venue',          'approved', NOW() - INTERVAL '21 days', v_user),
  (e10, v_ws, 'Catering — 420 covers at £95pp',     3990000, 'catering',       'approved', NOW() - INTERVAL '14 days', v_user),
  (e10, v_ws, 'Eventure AV full package',            450000,  'av',             'approved', NOW() - INTERVAL '10 days', v_user),
  (e10, v_ws, 'Maestro string quartet',              220000,  'entertainment',  'approved', NOW() - INTERVAL '10 days', v_user),
  (e10, v_ws, 'Flowers — 40 centrepieces',           160000,  'decor',          'approved', NOW() - INTERVAL '7 days',  v_user),
  -- Soho Festival (e11)
  (e11, v_ws, 'Stage Nation full production',       1800000, 'av',             'approved', NOW() - INTERVAL '30 days', v_user),
  (e11, v_ws, 'Greenfield Catering — full festival',2400000, 'catering',       'approved', NOW() - INTERVAL '28 days', v_user),
  (e11, v_ws, 'Glow Lighting 4-day rig',             620000,  'lighting',       'approved', NOW() - INTERVAL '25 days', v_user),
  -- Property Awards (e5)
  (e5,  v_ws, 'The O2 Arena venue deposit',         5000000, 'venue',          'approved', NOW() - INTERVAL '5 days',  v_user),
  (e5,  v_ws, 'Trophy manufacture x 45',              85000,  'production',     'pending',  NOW() - INTERVAL '1 day',   v_user),
  -- Burberry (e13 — completed)
  (e13, v_ws, 'Tate Modern hire — evening',         2200000, 'venue',          'approved', NOW() - INTERVAL '45 days', v_user),
  (e13, v_ws, 'Catering — 600 covers',              2400000, 'catering',       'approved', NOW() - INTERVAL '42 days', v_user),
  (e13, v_ws, 'AV and lighting full production',     980000,  'av',             'approved', NOW() - INTERVAL '40 days', v_user);

  -- ==========================================================================
  -- 7. TICKET TYPES
  -- ==========================================================================

  INSERT INTO public.ticket_types (
    event_id, workspace_id, name, price_cents, quantity, sold, currency, status, created_by
  ) VALUES
  -- Highland Games (e9)
  (e9,  v_ws, 'General Admission',   4500,  3000, 2618, 'GBP', 'active', v_user),
  (e9,  v_ws, 'VIP Enclosure',      12000,   500,  412, 'GBP', 'active', v_user),
  (e9,  v_ws, 'Corporate Table',    60000,    50,   42, 'GBP', 'active', v_user),
  -- Savoy Gala (e10)
  (e10, v_ws, 'Black Tie Gala',     25000,   420,  406, 'GBP', 'active', v_user),
  (e10, v_ws, 'VIP Table of 10',   150000,    20,   18, 'GBP', 'active', v_user),
  -- Soho Festival (e11)
  (e11, v_ws, 'Members Day Pass',    7500,  6000, 5840, 'GBP', 'active', v_user),
  (e11, v_ws, 'Members Evening',    12500,  2000, 1990, 'GBP', 'active', v_user),
  (e11, v_ws, 'Overnight Pass',     28000,   500,  388, 'GBP', 'active', v_user),
  -- Property Awards (e5)
  (e5,  v_ws, 'Individual Ticket',  15000,  1800,  943, 'GBP', 'active', v_user),
  (e5,  v_ws, 'Table of 10',       130000,    40,   18, 'GBP', 'active', v_user),
  -- KPMG Summit (e12)
  (e12, v_ws, 'Delegate Pass',      35000,  1200, 1078, 'GBP', 'active', v_user),
  (e12, v_ws, 'VIP Delegate',       75000,    50,   38, 'GBP', 'active', v_user),
  -- Burberry (e13 — completed, free event)
  (e13, v_ws, 'Guest Invitation',       0,   600,  594, 'GBP', 'closed', v_user);

  -- ==========================================================================
  -- 8. RUN-SHEET ITEMS
  -- lane values from enum: 'ops', 'stage_a', 'stage_b', 'arena', 'foyer',
  --                        'ballroom', 'lobby', 'main_hall', 'breakouts', 'atrium'
  -- (use whatever your run_sheet_lane enum contains — fallback NULL if not in enum)
  -- ==========================================================================

  INSERT INTO public.event_run_sheet_items (
    event_id, workspace_id, title, starts_at, duration_minutes, section, lane, position, notes
  ) VALUES
  -- Highland Games (e9)
  (e9,  v_ws, 'Site open — crew access',       NOW() + INTERVAL '27 days 7 hours',   120, 'Morning',   'ops',    1, 'All crew sign in at gate'),
  (e9,  v_ws, 'Opening ceremony — pipe band',  NOW() + INTERVAL '27 days 10 hours',   60, 'Morning',   'ops',    2, 'Pipe band leads in'),
  (e9,  v_ws, 'Hammer throw competition',      NOW() + INTERVAL '27 days 11 hours',   90, 'Afternoon', 'ops',    3, NULL),
  (e9,  v_ws, 'Tug of War — grand final',      NOW() + INTERVAL '27 days 14 hours',   45, 'Afternoon', 'ops',    4, NULL),
  (e9,  v_ws, 'Ceilidh doors open',            NOW() + INTERVAL '27 days 18 hours',   30, 'Evening',   'ops',    5, 'Bar opens simultaneously'),
  (e9,  v_ws, 'Ceilidh band — first set',      NOW() + INTERVAL '27 days 19 hours',  120, 'Evening',   'stage_a',6, NULL),
  -- Savoy Gala (e10)
  (e10, v_ws, 'Arrival drinks reception',      NOW() + INTERVAL '17 days 18 hours 30 minutes', 60,  'Evening', 'foyer',    1, 'Champagne sabrage at 18:45'),
  (e10, v_ws, 'Welcome address',               NOW() + INTERVAL '17 days 19 hours 30 minutes', 15,  'Evening', 'ballroom', 2, 'Eleanor Hartley opening speech'),
  (e10, v_ws, 'Three-course dinner',           NOW() + INTERVAL '17 days 19 hours 45 minutes', 90,  'Evening', 'ballroom', 3, 'Maestro quartet plays throughout'),
  (e10, v_ws, 'Awards presentation — 6 awards',NOW() + INTERVAL '17 days 21 hours 15 minutes', 45,  'Evening', 'ballroom', 4, NULL),
  (e10, v_ws, 'Dancing and entertainment',     NOW() + INTERVAL '17 days 22 hours',              120, 'Evening', 'ballroom', 5, 'DJ takes over from quartet at 22:30'),
  -- Soho Festival (e11)
  (e11, v_ws, 'Gates open',                    NOW() - INTERVAL '16 hours',            30, 'Morning',   'ops',    1, NULL),
  (e11, v_ws, 'Stage A — opening acts',        NOW() - INTERVAL '14 hours',            60, 'Morning',   'stage_a',2, NULL),
  (e11, v_ws, 'Stage B — acoustic sessions',   NOW() - INTERVAL '13 hours',            90, 'Afternoon', 'stage_b',3, NULL),
  (e11, v_ws, 'Headliner sound check',         NOW() + INTERVAL '5 hours',             60, 'Evening',   'stage_a',4, 'Must complete before 20:00'),
  (e11, v_ws, 'Headliner set',                 NOW() + INTERVAL '8 hours',             90, 'Evening',   'stage_a',5, NULL),
  -- KPMG Summit (e12)
  (e12, v_ws, 'Registration and coffee',       NOW(),                                  60, 'Morning',   'lobby',      1, NULL),
  (e12, v_ws, 'Opening keynote: Future of AI', NOW() + INTERVAL '1 hour',              60, 'Morning',   'main_hall',  2, 'David Nguyen presenting'),
  (e12, v_ws, 'Morning break',                 NOW() + INTERVAL '2 hours',             30, 'Morning',   'lobby',      3, NULL),
  (e12, v_ws, 'Breakout sessions — 4 tracks',  NOW() + INTERVAL '2 hours 30 minutes',  90, 'Afternoon', 'breakouts',  4, NULL),
  (e12, v_ws, 'Networking lunch — atrium',     NOW() + INTERVAL '4 hours',             60, 'Afternoon', 'atrium',     5, NULL);

  -- ==========================================================================
  -- 9. EVENT ACTIVITY LOG
  -- ==========================================================================

  INSERT INTO public.event_activity (
    event_id, workspace_id, action, actor_name, actor_user_id, note, resource_type, created_at
  ) VALUES
  (e10, v_ws, 'task_completed',     'Jamahl Thomas', v_user, 'Finalised seating plan',                          'task',     NOW() - INTERVAL '3 days'),
  (e10, v_ws, 'supplier_confirmed', 'Jamahl Thomas', v_user, 'Savoy catering confirmed and signed',             'supplier', NOW() - INTERVAL '4 days'),
  (e10, v_ws, 'guest_added',        'Jamahl Thomas', v_user, 'Added Victoria St. Clare to guest list',          'guest',    NOW() - INTERVAL '5 days'),
  (e10, v_ws, 'task_completed',     'Jamahl Thomas', v_user, 'Dietary requirements confirmed with kitchen',     'task',     NOW() - INTERVAL '2 days'),
  (e10, v_ws, 'note_added',         'System',        NULL,   'Event is T-18 days. All suppliers confirmed.',    'event',    NOW() - INTERVAL '1 day'),
  (e9,  v_ws, 'event_confirmed',    'System',        NULL,   'Event confirmed — all core suppliers locked',     'event',    NOW() - INTERVAL '7 days'),
  (e9,  v_ws, 'task_completed',     'Jamahl Thomas', v_user, 'Catering headcount submitted',                    'task',     NOW() - INTERVAL '5 days'),
  (e9,  v_ws, 'supplier_confirmed', 'Jamahl Thomas', v_user, 'North Stage Events signed contract',              'supplier', NOW() - INTERVAL '6 days'),
  (e11, v_ws, 'check_in_started',   'System',        NULL,   'Check-in desk opened — event is live',            'event',    NOW() - INTERVAL '16 hours'),
  (e11, v_ws, 'task_completed',     'Jamahl Thomas', v_user, 'Stage A sound check complete',                    'task',     NOW() - INTERVAL '14 hours'),
  (e11, v_ws, 'update',             'Jamahl Thomas', v_user, 'Artist green rooms ready',                        'task',     NOW() - INTERVAL '10 hours'),
  (e12, v_ws, 'check_in_started',   'System',        NULL,   'Day 1 registration open',                         'event',    NOW() - INTERVAL '1 hour'),
  (e12, v_ws, 'task_completed',     'Jamahl Thomas', v_user, 'Keynote AV check complete',                       'task',     NOW() - INTERVAL '2 hours'),
  (e5,  v_ws, 'quote_sent',         'Jamahl Thomas', v_user, 'Quote v1 sent to Marcus Bell at Nationwide',      'quote',    NOW() - INTERVAL '3 days'),
  (e7,  v_ws, 'quote_sent',         'Jamahl Thomas', v_user, 'Detailed quote sent to Charlotte Davies',         'quote',    NOW() - INTERVAL '7 days'),
  (e3,  v_ws, 'brief_created',      'Jamahl Thomas', v_user, 'Initial brief template prepared for review',      'brief',    NOW() - INTERVAL '2 days'),
  (e13, v_ws, 'event_completed',    'System',        NULL,   'Event marked completed. Settlement underway.',    'event',    NOW() - INTERVAL '14 days'),
  (e15, v_ws, 'event_cancelled',    'System',        NULL,   'Cancelled by client. Clause invoked.',            'event',    NOW() - INTERVAL '3 days');

END $$;
