-- =============================================================================
-- Gala Dock — Full Demo Event Seed (35 events, all 9 pipeline stages)
-- Idempotent: ON CONFLICT (id) DO NOTHING on fixed UUIDs.
-- ⚠️  Replace <WORKSPACE_ID> with a real workspace UUID before running.
-- ⚠️  ONLY run in dev/staging. Never overwrite production data.
-- =============================================================================

DO $$
DECLARE
  ws_id    uuid := '<WORKSPACE_ID>';
  owner_id uuid;
BEGIN
  -- Safety guard: bail out if placeholder was not replaced
  IF ws_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'Replace <WORKSPACE_ID> with a real workspace UUID before running this seed.';
  END IF;

  SELECT user_id INTO owner_id
  FROM public.workspace_members
  WHERE workspace_id = ws_id
  ORDER BY created_at
  LIMIT 1;

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 1: new_enquiry (5 events)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.events (
    id, workspace_id, created_by, owner_user_id, name, status, event_type,
    start_at, end_at, venue_name_snapshot, location,
    guest_count_day, guest_count_evening, budget_cents,
    client_name, client_company, risk_level, readiness_score,
    next_action, next_action_due, cover_image_url, flagged, created_at, updated_at
  ) VALUES

  ( 'eeee0001-0000-0000-0000-000000000001', ws_id, owner_id, owner_id,
    'Global Tech Summit 2026', 'new_enquiry', 'Conference',
    '2026-09-15 09:00:00+01', '2026-09-17 18:00:00+01',
    'ExCeL London', 'Royal Docks, London E16',
    1200, 0, 28500000,
    'Sarah Mitchell', 'TechCorp Global Ltd',
    'medium', 15,
    'Send venue options pack', '2026-07-18',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000002', ws_id, owner_id, owner_id,
    'Hartley & Sons Annual Gala', 'new_enquiry', 'Gala Dinner',
    '2026-11-21 19:00:00+00', '2026-11-21 23:30:00+00',
    'The Shard', 'London Bridge, London SE1',
    0, 350, 9800000,
    'James Hartley', 'Hartley & Sons LLP',
    'low', 10,
    'Schedule discovery call', '2026-07-15',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000003', ws_id, owner_id, owner_id,
    'Northbridge University Graduation Ball', 'new_enquiry', 'Ball',
    '2026-06-27 18:30:00+01', '2026-06-27 23:59:00+01',
    'Battersea Power Station', 'Battersea, London SW11',
    0, 800, 15000000,
    'Dr. Rachel Evans', 'Northbridge University',
    'low', 5,
    'Send initial proposal template', '2026-07-20',
    'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000004', ws_id, owner_id, owner_id,
    'Apex Capital Investor Day', 'new_enquiry', 'Corporate Day',
    '2026-10-08 08:00:00+01', '2026-10-08 17:00:00+01',
    'Canary Wharf', 'Canary Wharf, London E14',
    180, 0, 6500000,
    'Oliver Fenn', 'Apex Capital Partners',
    'high', 20,
    'Urgent: confirm date availability', '2026-07-14',
    'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000005', ws_id, owner_id, owner_id,
    'Savoy Fashion Week After Party', 'new_enquiry', 'Private Party',
    '2026-09-20 22:00:00+01', '2026-09-21 03:00:00+01',
    'Tobacco Dock', 'Wapping, London E1W',
    0, 600, 18000000,
    'Claudia Renard', 'House of Renard',
    'medium', 8,
    'Request creative brief', '2026-07-17',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80',
    false, now(), now() ),

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 2: briefing (4 events)
  -- ────────────────────────────────────────────────────────────────────────────

  ( 'eeee0001-0000-0000-0000-000000000006', ws_id, owner_id, owner_id,
    'Meridian Bank Leadership Forum', 'briefing', 'Leadership Forum',
    '2026-10-22 09:00:00+01', '2026-10-23 17:00:00+01',
    'QEII Centre', 'Westminster, London SW1P',
    450, 0, 22000000,
    'Christine Alcock', 'Meridian Bank Plc',
    'low', 35,
    'Complete AV & staging brief', '2026-07-25',
    'https://images.unsplash.com/photo-1461532257246-777de18cd58b?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000007', ws_id, owner_id, owner_id,
    'Royal Gala Charity Ball 2026', 'briefing', 'Charity Ball',
    '2026-11-07 19:00:00+00', '2026-11-08 00:00:00+00',
    'Natural History Museum', 'South Kensington, London SW7',
    0, 700, 32000000,
    'Lady Victoria Ashworth', 'Ashworth Foundation',
    'low', 55,
    'Finalise entertainment brief', '2026-07-22',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000008', ws_id, owner_id, owner_id,
    'Zenith Product Launch — Series C', 'briefing', 'Product Launch',
    '2026-08-28 14:00:00+01', '2026-08-28 22:00:00+01',
    'Roundhouse', 'Chalk Farm, London NW1',
    0, 500, 12500000,
    'Priya Sharma', 'Zenith AI Ltd',
    'medium', 42,
    'Tech spec brief from AV supplier', '2026-07-19',
    'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000009', ws_id, owner_id, owner_id,
    'Union Square Summer Rooftop', 'briefing', 'Outdoor Festival',
    '2026-08-01 16:00:00+01', '2026-08-02 02:00:00+01',
    'Alexandra Palace', 'Wood Green, London N22',
    0, 2000, 45000000,
    'Dan Okafor', 'Union Square Events Ltd',
    'high', 28,
    'Site visit & fire safety recce', '2026-07-16',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
    false, now(), now() ),

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 3: quoting (4 events)
  -- ────────────────────────────────────────────────────────────────────────────

  ( 'eeee0001-0000-0000-0000-000000000010', ws_id, owner_id, owner_id,
    'Blackwood Partners Year-End Dinner', 'quoting', 'Corporate Dinner',
    '2026-12-05 19:30:00+00', '2026-12-05 23:30:00+00',
    'Barbican Centre', 'Barbican, London EC2Y',
    0, 250, 8700000,
    'Andrew Blackwood', 'Blackwood Partners LLP',
    'low', 60,
    'Submit final proposal v2', '2026-07-21',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000011', ws_id, owner_id, owner_id,
    'Luminary Awards Ceremony 2026', 'quoting', 'Awards Night',
    '2026-10-16 18:00:00+01', '2026-10-16 23:00:00+01',
    'Royal Albert Hall', 'South Kensington, London SW7',
    0, 1800, 75000000,
    'Genevieve Cole', 'Luminary Media Group',
    'medium', 72,
    'Pricing sign-off with MD', '2026-07-18',
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000012', ws_id, owner_id, owner_id,
    'Harbour Group Team Offsite', 'quoting', 'Team Away Day',
    '2026-09-04 09:00:00+01', '2026-09-05 17:00:00+01',
    'Wembley Stadium', 'Wembley, London HA9',
    300, 0, 5500000,
    'Marcus Hunt', 'Harbour Group Ltd',
    'low', 58,
    'Send revised catering costs', '2026-07-23',
    'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000013', ws_id, owner_id, owner_id,
    'Prestige Motors Launch Night', 'quoting', 'Product Launch',
    '2026-08-14 19:00:00+01', '2026-08-14 23:00:00+01',
    'Somerset House', 'Strand, London WC2R',
    0, 400, 11200000,
    'Isabella Romano', 'Prestige Motors UK',
    'low', 65,
    'Confirm AV supplier for quote', '2026-07-20',
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80',
    false, now(), now() ),

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 4: awaiting_approval (4 events)
  -- ────────────────────────────────────────────────────────────────────────────

  ( 'eeee0001-0000-0000-0000-000000000014', ws_id, owner_id, owner_id,
    'Everest Consulting Annual Conference', 'awaiting_approval', 'Conference',
    '2026-11-03 09:00:00+00', '2026-11-05 17:00:00+00',
    'ExCeL London', 'Royal Docks, London E16',
    1500, 0, 38000000,
    'Patricia Owen', 'Everest Consulting Group',
    'medium', 75,
    'Follow up on board sign-off', '2026-07-16',
    'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000015', ws_id, owner_id, owner_id,
    'Sterling Asset Management Gala', 'awaiting_approval', 'Gala Dinner',
    '2026-10-30 19:00:00+00', '2026-10-30 23:30:00+00',
    'Kensington Palace', 'Kensington, London W8',
    0, 500, 16500000,
    'Robert Sterling', 'Sterling Asset Management',
    'high', 80,
    'Chase CFO for budget approval', '2026-07-15',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000016', ws_id, owner_id, owner_id,
    'Orion Tech Hackathon Weekend', 'awaiting_approval', 'Hackathon',
    '2026-08-22 10:00:00+01', '2026-08-24 18:00:00+01',
    'Olympic Park', 'Stratford, London E20',
    500, 0, 9200000,
    'Tomás Vega', 'Orion Technology Ltd',
    'low', 70,
    'Await internal procurement review', '2026-07-19',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000017', ws_id, owner_id, owner_id,
    'Heritage Trust 50th Anniversary', 'awaiting_approval', 'Anniversary Gala',
    '2026-09-26 19:00:00+01', '2026-09-26 23:00:00+01',
    'Tate Modern', 'Bankside, London SE1',
    0, 600, 21000000,
    'Eleanor Fawcett', 'The Heritage Trust',
    'medium', 78,
    'Resend proposal with updated menu', '2026-07-17',
    'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80',
    false, now(), now() ),

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 5: confirmed (5 events)
  -- ────────────────────────────────────────────────────────────────────────────

  ( 'eeee0001-0000-0000-0000-000000000018', ws_id, owner_id, owner_id,
    'Pinnacle Group Q3 Summit', 'confirmed', 'Summit',
    '2026-08-05 09:00:00+01', '2026-08-06 17:00:00+01',
    'Central Hall Westminster', 'Westminster, London SW1H',
    600, 0, 19500000,
    'Harriet Weston', 'Pinnacle Group International',
    'low', 82,
    'Confirm delegate packs with print', '2026-07-22',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000019', ws_id, owner_id, owner_id,
    'Cascade Media Awards 2026', 'confirmed', 'Awards Ceremony',
    '2026-09-12 18:00:00+01', '2026-09-12 23:00:00+01',
    'The O2 Arena', 'Peninsula Square, London SE10',
    0, 3500, 120000000,
    'Naomi Clarke', 'Cascade Media Holdings',
    'medium', 68,
    'Sign stage design contract', '2026-07-25',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000020', ws_id, owner_id, owner_id,
    'Ashford & Bell Summer Party', 'confirmed', 'Summer Party',
    '2026-07-25 17:00:00+01', '2026-07-25 22:30:00+01',
    'Battersea Power Station', 'Battersea, London SW11',
    0, 450, 14000000,
    'Dominic Bell', 'Ashford & Bell Solicitors',
    'low', 90,
    'Finalise bar packages', '2026-07-14',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000021', ws_id, owner_id, owner_id,
    'Vector Capital New Year Reception', 'confirmed', 'Reception',
    '2026-12-18 18:30:00+00', '2026-12-18 22:00:00+00',
    'IET London', 'Savoy Place, London WC2R',
    200, 0, 7800000,
    'Felix Kwan', 'Vector Capital Ltd',
    'low', 74,
    'Book live jazz trio', '2026-07-28',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000022', ws_id, owner_id, owner_id,
    'Solaris Energy Forum', 'confirmed', 'Industry Forum',
    '2026-10-14 09:00:00+01', '2026-10-15 17:00:00+01',
    'QEII Centre', 'Westminster, London SW1P',
    900, 0, 31000000,
    'Anna Brandt', 'Solaris Energy Plc',
    'medium', 61,
    'Confirm keynote speaker logistics', '2026-07-20',
    'https://images.unsplash.com/photo-1461532257246-777de18cd58b?w=800&q=80',
    false, now(), now() ),

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 6: in_delivery (4 events)
  -- ────────────────────────────────────────────────────────────────────────────

  ( 'eeee0001-0000-0000-0000-000000000023', ws_id, owner_id, owner_id,
    'NexGen Fintech Forum — Live Day 1', 'in_delivery', 'Conference',
    '2026-07-10 08:00:00+01', '2026-07-12 18:00:00+01',
    'ExCeL London', 'Royal Docks, London E16',
    2000, 0, 55000000,
    'Brendan Foley', 'NexGen Fintech Ltd',
    'low', 95,
    'Oversee lunchtime catering service', '2026-07-10',
    'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000024', ws_id, owner_id, owner_id,
    'Bluewave Music Festival — Weekend', 'in_delivery', 'Festival',
    '2026-07-11 12:00:00+01', '2026-07-13 23:00:00+01',
    'Olympic Park', 'Stratford, London E20',
    0, 8000, 200000000,
    'Sienna Walsh', 'Bluewave Events Ltd',
    'high', 88,
    'AV check main stage PA', '2026-07-11',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000025', ws_id, owner_id, owner_id,
    'Lynwood Charity Gala — Tonight', 'in_delivery', 'Charity Gala',
    '2026-07-11 19:00:00+01', '2026-07-11 23:30:00+01',
    'Somerset House', 'Strand, London WC2R',
    0, 380, 17500000,
    'Lady Catherine Lynwood', 'The Lynwood Foundation',
    'low', 99,
    'Guest welcome & seating check', '2026-07-11',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000026', ws_id, owner_id, owner_id,
    'Vertex HR Expo Day 2', 'in_delivery', 'Exhibition',
    '2026-07-10 09:00:00+01', '2026-07-11 17:00:00+01',
    'Barbican Centre', 'Barbican, London EC2Y',
    1100, 0, 24000000,
    'Yasmin Patel', 'Vertex HR Solutions',
    'medium', 91,
    'Session recording upload check', '2026-07-10',
    'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&q=80',
    false, now(), now() ),

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 7: completed (5 events)
  -- ────────────────────────────────────────────────────────────────────────────

  ( 'eeee0001-0000-0000-0000-000000000027', ws_id, owner_id, owner_id,
    'Glencroft Investment Summit', 'completed', 'Summit',
    '2026-06-05 09:00:00+01', '2026-06-06 17:00:00+01',
    'QEII Centre', 'Westminster, London SW1P',
    800, 0, 27000000,
    'Edward Glencroft', 'Glencroft Investment Ltd',
    'low', 100,
    NULL, NULL,
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000028', ws_id, owner_id, owner_id,
    'Nova Brands Summer Launch Party', 'completed', 'Brand Launch',
    '2026-06-20 18:00:00+01', '2026-06-20 23:00:00+01',
    'Roundhouse', 'Chalk Farm, London NW1',
    0, 900, 23500000,
    'Chloe Dupont', 'Nova Brands International',
    'low', 100,
    NULL, NULL,
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000029', ws_id, owner_id, owner_id,
    'Clearwater Annual Ball', 'completed', 'Black Tie Ball',
    '2026-05-09 19:30:00+01', '2026-05-10 01:00:00+01',
    'Natural History Museum', 'South Kensington, London SW7',
    0, 650, 41000000,
    'Thomas Clearwater', 'Clearwater Family Trust',
    'low', 100,
    NULL, NULL,
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80',
    true, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000030', ws_id, owner_id, owner_id,
    'Kestrel Tech Developer Day', 'completed', 'Tech Day',
    '2026-05-23 09:00:00+01', '2026-05-23 18:00:00+01',
    'Science Museum', 'South Kensington, London SW7',
    400, 0, 11000000,
    'Lydia Harper', 'Kestrel Technology Group',
    'low', 100,
    NULL, NULL,
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000031', ws_id, owner_id, owner_id,
    'Atlas Properties Leadership Dinner', 'completed', 'Leadership Dinner',
    '2026-04-17 19:00:00+01', '2026-04-17 23:00:00+01',
    'IET London', 'Savoy Place, London WC2R',
    0, 120, 8200000,
    'Nicholas Alderton', 'Atlas Properties Group',
    'low', 100,
    NULL, NULL,
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    false, now(), now() ),

  -- ────────────────────────────────────────────────────────────────────────────
  -- Stage 8: cancelled (4 events)
  -- ────────────────────────────────────────────────────────────────────────────

  ( 'eeee0001-0000-0000-0000-000000000032', ws_id, owner_id, owner_id,
    'Vanguard Capital IPO Celebration', 'cancelled', 'Celebration',
    '2026-07-04 19:00:00+01', '2026-07-04 23:00:00+01',
    'The Shard', 'London Bridge, London SE1',
    0, 200, 14000000,
    'Simon Blake', 'Vanguard Capital Ltd',
    'low', 0,
    NULL, NULL,
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000033', ws_id, owner_id, owner_id,
    'Archon Pharma Global Congress', 'cancelled', 'Congress',
    '2026-09-30 09:00:00+01', '2026-10-02 17:00:00+01',
    'ExCeL London', 'Royal Docks, London E16',
    3000, 0, 92000000,
    'Ingrid Sorensen', 'Archon Pharma AG',
    'high', 0,
    NULL, NULL,
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000034', ws_id, owner_id, owner_id,
    'Falcon Sport Brand Pop-Up', 'cancelled', 'Brand Activation',
    '2026-08-10 11:00:00+01', '2026-08-10 20:00:00+01',
    'Wembley Stadium', 'Wembley, London HA9',
    0, 1500, 7500000,
    'Jordan Osei', 'Falcon Sport Ltd',
    'medium', 0,
    NULL, NULL,
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80',
    false, now(), now() ),

  ( 'eeee0001-0000-0000-0000-000000000035', ws_id, owner_id, owner_id,
    'Crown Estate Property Showcase', 'cancelled', 'Showcase',
    '2026-10-19 10:00:00+01', '2026-10-19 16:00:00+01',
    'Tate Modern', 'Bankside, London SE1',
    250, 0, 5300000,
    'Laura Finch', 'Crown Estate Holdings',
    'low', 0,
    NULL, NULL,
    'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80',
    false, now(), now() )

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Demo event seed complete: up to 35 events inserted into workspace %.', ws_id;

END $$;
