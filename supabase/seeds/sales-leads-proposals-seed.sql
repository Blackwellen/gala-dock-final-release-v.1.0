-- =============================================================================
-- Gala Dock — Sales section demo seed (Leads + Proposals)
-- Idempotent: fixed UUIDs, ON CONFLICT DO NOTHING.
-- Dates are relative to now() so the seed stays sensible whenever it's run.
-- Cover photos reuse the same validated Unsplash URL pool already used by
-- supabase/seeds/demo-events-full-seed.sql (public.events.cover_image_url).
-- ⚠️  Dev/staging only — never run against a live production workspace.
-- Looks up "Grannit Holdings" by name; edit ws_name below to target a
-- different workspace.
-- =============================================================================

DO $$
DECLARE
  ws_id     uuid;
  ws_name   text := 'Grannit Holdings';
  owner_id  uuid;

  -- Fixed lead UUIDs (idempotent)
  lead_tech      uuid := '1ead0001-0000-0000-0000-000000000001';
  lead_carter    uuid := '1ead0001-0000-0000-0000-000000000002';
  lead_clubvibe  uuid := '1ead0001-0000-0000-0000-000000000003';
  lead_webinar   uuid := '1ead0001-0000-0000-0000-000000000004';
  lead_summer    uuid := '1ead0001-0000-0000-0000-000000000005';
  lead_theatre   uuid := '1ead0001-0000-0000-0000-000000000006';
  lead_charity   uuid := '1ead0001-0000-0000-0000-000000000007';
  lead_birthday  uuid := '1ead0001-0000-0000-0000-000000000008';

  -- Fixed proposal UUIDs (idempotent)
  prop_pulse     uuid := '9000a001-0000-0000-0000-000000000001';
  prop_hartwell  uuid := '9000a001-0000-0000-0000-000000000002';
  prop_riverside uuid := '9000a001-0000-0000-0000-000000000003';
  prop_gtc       uuid := '9000a001-0000-0000-0000-000000000004';
  prop_theatre   uuid := '9000a001-0000-0000-0000-000000000005';
  prop_birthday  uuid := '9000a001-0000-0000-0000-000000000006';
  prop_expo      uuid := '9000a001-0000-0000-0000-000000000007';
  prop_awards    uuid := '9000a001-0000-0000-0000-000000000008';
  prop_clubvibe  uuid := '9000a001-0000-0000-0000-000000000009';
  prop_webinar   uuid := '9000a001-0000-0000-0000-00000000000a';
  prop_charity   uuid := '9000a001-0000-0000-0000-00000000000b';
  prop_summer    uuid := '9000a001-0000-0000-0000-00000000000c';

  -- Cover photos (validated Unsplash IDs already trusted elsewhere in this repo)
  img_conference text := 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';
  img_wedding    text := 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80';
  img_wedding2   text := 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&q=80';
  img_nightclub  text := 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80';
  img_webinar    text := 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80';
  img_festival   text := 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80';
  img_festival2  text := 'https://images.unsplash.com/photo-1461532257246-777de18cd58b?w=800&q=80';
  img_theatre    text := 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80';
  img_charity    text := 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80';
  img_charity2   text := 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&q=80';
  img_party      text := 'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&q=80';
  img_conference2 text := 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80';
  img_conference3 text := 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80';
  img_exhibition text := 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&q=80';
BEGIN
  SELECT id INTO ws_id FROM public.workspaces WHERE name = ws_name LIMIT 1;
  IF ws_id IS NULL THEN
    RAISE NOTICE 'Workspace "%" not found — skipping Sales demo seed.', ws_name;
    RETURN;
  END IF;

  SELECT user_id INTO owner_id
  FROM public.workspace_members
  WHERE workspace_id = ws_id
  ORDER BY created_at
  LIMIT 1;

  -- ===========================================================================
  -- LEADS
  -- ===========================================================================
  INSERT INTO public.leads (
    id, workspace_id, title, client_name, client_email, client_phone, company_name,
    job_title, event_type, event_date, event_location, city, event_format,
    guest_count_estimate, budget_estimate_cents, budget_min_cents, budget_max_cents, currency,
    stage, source, priority, assigned_to, created_by, notes,
    is_draft, wizard_step, cover_theme, cover_image_url,
    lead_score, lead_score_breakdown, qualification, next_actions
  ) VALUES
  (lead_tech, ws_id, 'Tech Summit 2026', 'James Clarke', 'james.clarke@innovate.com', '+44 7700 900101', 'Innovate Ltd',
    'Head of Events', 'Conference', current_date + interval '9 months', 'ExCeL London', 'London', 'in-person',
    800, 12000000, 12000000, 18000000, 'GBP',
    'new-enquiry', 'website', 'high', owner_id, owner_id, 'Corporate AGM + product showcase. Wants AV-heavy staging.',
    false, 'qualification', 'Conference', img_conference,
    82, '{"fit":22,"budget":20,"need":20,"timing":10,"engagement":10}'::jsonb, '{"budget_confirmed":true,"decision_maker_identified":true}'::jsonb,
    '[{"id":"a1","label":"Call back today","done":false}]'::jsonb),
  (lead_carter, ws_id, 'Carter Wedding', 'Sarah Carter', 'sarah.carter@carterevents.co.uk', '+44 7700 900123', 'Carter Events Ltd',
    'Events Director', 'Wedding', current_date + interval '14 months', 'Hedsor House, Bucks', 'Buckinghamshire', 'in-person',
    150, 6500000, 6500000, 6500000, 'GBP',
    'contacted', 'instagram', 'high', owner_id, owner_id, 'Riverside venue, AV & staging, Thu/Fri dates preferred.',
    false, 'qualification', 'Wedding', img_wedding,
    91, '{"fit":24,"budget":22,"need":22,"timing":13,"engagement":10}'::jsonb, '{"budget_confirmed":true}'::jsonb,
    '[{"id":"a1","label":"Send brochure tomorrow","done":false}]'::jsonb),
  (lead_clubvibe, ws_id, 'Club Vibe NYE', 'Liam O''Connor', 'liam@vibeevents.co.uk', '+44 7700 900145', 'Vibe Events',
    'Producer', 'Nightclub', current_date + interval '5 months', 'Ministry of Sound, London', 'London', 'in-person',
    1200, 8500000, 8000000, 9000000, 'GBP',
    'proposal-sent', 'referral', 'medium', owner_id, owner_id, 'NYE takeover, headline DJ + full production.',
    false, 'qualification', 'Nightclub', img_nightclub,
    78, '{"fit":18,"budget":18,"need":20,"timing":12,"engagement":10}'::jsonb, '{"budget_confirmed":true,"event_date_confirmed":true}'::jsonb,
    '[{"id":"a1","label":"Follow up in 2 days","done":false}]'::jsonb),
  (lead_webinar, ws_id, 'AI in Marketing Webinar', 'Priya Shah', 'priya.shah@datamind.ai', '+44 7700 900167', 'DataMind',
    'Marketing Lead', 'Webinar', current_date + interval '3 months', 'Online Event', 'Virtual', 'remote',
    300, 1200000, 1200000, 1200000, 'GBP',
    'negotiating', 'linkedin', 'medium', owner_id, owner_id, 'Sponsored webinar series, needs streaming platform + moderation.',
    false, 'qualification', 'Webinar', img_webinar,
    67, '{"fit":16,"budget":14,"need":16,"timing":11,"engagement":10}'::jsonb, '{"brief_received":true}'::jsonb,
    '[{"id":"a1","label":"Review contract in 3 days","done":false}]'::jsonb),
  (lead_summer, ws_id, 'Summer Beats Festival', 'Ben Roberts', 'ben.roberts@livenation.co.uk', '+44 7700 900189', 'LiveNation UK',
    'Festival Director', 'Festival', current_date + interval '11 months', 'Victoria Park, London', 'London', 'in-person',
    5000, 25000000, 22000000, 28000000, 'GBP',
    'proposal-sent', 'website', 'high', owner_id, owner_id, 'Multi-stage outdoor festival, licensing + security critical.',
    false, 'qualification', 'Festival', img_festival,
    89, '{"fit":24,"budget":24,"need":22,"timing":9,"engagement":10}'::jsonb, '{"budget_confirmed":true,"venue_type_aligned":true}'::jsonb,
    '[{"id":"a1","label":"Site visit in 5 days","done":false}]'::jsonb),
  (lead_theatre, ws_id, 'Theatre Gala Night', 'Charlotte Bell', 'charlotte.bell@westendtrust.org.uk', '+44 7700 900201', 'West End Trust',
    'Development Manager', 'Theatre', current_date + interval '7 months', 'The London Palladium', 'London', 'in-person',
    600, 4500000, 4000000, 5000000, 'GBP',
    'negotiating', 'email', 'low', owner_id, owner_id, 'Annual fundraising gala, red carpet + press.',
    false, 'qualification', 'Theatre', img_theatre,
    74, '{"fit":18,"budget":18,"need":18,"timing":10,"engagement":10}'::jsonb, '{}'::jsonb,
    '[{"id":"a1","label":"Budget call in 1 week","done":false}]'::jsonb),
  (lead_charity, ws_id, 'Children First Charity Ball', 'Emma Scott', 'emma.scott@childrenfirst.org.uk', '+44 7700 900223', 'Children First',
    'Fundraising Manager', 'Charity', current_date + interval '6 months', 'Old Billingsgate, London', 'London', 'in-person',
    400, 3000000, 3000000, 3000000, 'GBP',
    'won', 'referral', 'medium', owner_id, owner_id, 'Annual charity ball, silent auction + drinks reception.',
    false, 'qualification', 'Charity', img_charity,
    88, '{"fit":22,"budget":20,"need":20,"timing":16,"engagement":10}'::jsonb, '{"budget_confirmed":true,"decision_maker_identified":true,"consent_captured":true}'::jsonb,
    '[{"id":"a1","label":"Kick-off meeting today","done":true}]'::jsonb),
  (lead_birthday, ws_id, 'James 40th Birthday', 'James Mitchell', 'james.mitchell@example.co.uk', '+44 7700 900245', NULL,
    NULL, 'Private Party', current_date + interval '4 months', 'The Ned, London', 'London', 'in-person',
    80, 1500000, 1500000, 1500000, 'GBP',
    'lost', 'instagram', 'low', owner_id, owner_id, 'Chose a competing venue.',
    false, 'qualification', 'Private Party', img_party,
    63, '{"fit":14,"budget":16,"need":14,"timing":9,"engagement":10}'::jsonb, '{}'::jsonb,
    '[]'::jsonb)
  ON CONFLICT (id) DO UPDATE SET cover_image_url = EXCLUDED.cover_image_url;

  -- ===========================================================================
  -- PROPOSALS
  -- ===========================================================================
  INSERT INTO public.proposals (
    id, workspace_id, lead_id, title, client_name, client_email, event_type, event_date,
    event_location, guest_count, status, valid_until, total_cents, currency, deposit_pct,
    version, margin_pct, cover_theme, cover_image_url, next_action_label, next_action_due, owner_id, created_by
  ) VALUES
  (prop_pulse, ws_id, lead_tech, 'Pulse Summit & After Dark Proposal', 'James Clarke', 'james.clarke@innovate.com',
    'Conference', current_date + interval '9 months', 'ExCeL London', 800, 'sent', current_date + interval '18 days',
    12500000, 'GBP', 33, 2, 28, 'Conference', img_conference, 'Send reminder', current_date + interval '3 days', owner_id, owner_id),
  (prop_hartwell, ws_id, lead_carter, 'Hartwell Wedding Proposal', 'Sarah Carter', 'sarah.carter@carterevents.co.uk',
    'Wedding', current_date + interval '14 months', 'Hedsor House, Bucks', 150, 'viewed', current_date + interval '24 days',
    6850000, 'GBP', 33, 1, 32, 'Wedding', img_wedding2, 'Follow up', current_date + interval '2 days', owner_id, owner_id),
  (prop_riverside, ws_id, NULL, 'Riverside Food Festival Proposal', 'Tom Wilson', 'tom.wilson@riversideevents.co.uk',
    'Festival', current_date + interval '10 months', 'Riverside Park', 2000, 'sent', current_date + interval '21 days',
    3600000, 'GBP', 33, 1, 24, 'Festival', img_festival2, 'Check in', current_date, owner_id, owner_id),
  (prop_gtc, ws_id, NULL, 'Global Tech Conference Proposal', 'Alex Morgan', 'alex.morgan@techforward.co.uk',
    'Conference', current_date + interval '9 months', 'ExCeL London', 1500, 'sent', current_date + interval '18 days',
    21000000, 'GBP', 33, 2, 30, 'Conference', img_conference2, 'Send reminder', current_date + interval '1 day', owner_id, owner_id),
  (prop_theatre, ws_id, lead_theatre, 'Theatre Gala Night Proposal', 'Charlotte Bell', 'charlotte.bell@westendtrust.org.uk',
    'Theatre', current_date + interval '7 months', 'The London Palladium', 600, 'signed', current_date + interval '14 days',
    4500000, 'GBP', 33, 1, 27, 'Theatre', img_theatre, 'Send invoice', current_date, owner_id, owner_id),
  (prop_birthday, ws_id, lead_birthday, 'Private Party Proposal — 40th Birthday', 'James Mitchell', 'james.mitchell@example.co.uk',
    'Private Party', current_date + interval '4 months', 'The Ned, London', 80, 'draft', current_date + interval '30 days',
    1500000, 'GBP', 33, 1, 22, 'Private Party', img_party, 'Review & send', current_date + interval '1 day', owner_id, owner_id),
  (prop_expo, ws_id, NULL, 'Future Build Expo Proposal', 'Olivia Bennett', 'olivia.bennett@buildsphere.co.uk',
    'Exhibition', current_date + interval '8 months', 'NEC Birmingham', 3000, 'expired', current_date - interval '5 days',
    7800000, 'GBP', 33, 1, 26, 'Exhibition', img_exhibition, 'Renew or close', current_date, owner_id, owner_id),
  (prop_awards, ws_id, NULL, 'Innovation Awards Proposal', 'James Clarke', 'james.clarke@innovate.com',
    'Conference', current_date + interval '12 months', 'The London Palladium', 500, 'sent', current_date + interval '25 days',
    6200000, 'GBP', 33, 1, 31, 'Conference', img_conference3, 'Send reminder', current_date + interval '5 days', owner_id, owner_id),
  (prop_clubvibe, ws_id, lead_clubvibe, 'Club Vibe NYE Package', 'Liam O''Connor', 'liam@vibeevents.co.uk',
    'Nightclub', current_date + interval '5 months', 'Ministry of Sound, London', 1200, 'viewed', current_date + interval '15 days',
    8500000, 'GBP', 33, 1, 36, 'Nightclub', img_nightclub, 'Follow up', current_date + interval '2 days', owner_id, owner_id),
  (prop_webinar, ws_id, lead_webinar, 'AI in Marketing Webinar Sponsorship', 'Priya Shah', 'priya.shah@datamind.ai',
    'Webinar', current_date + interval '3 months', 'Online Event', 300, 'sent', current_date + interval '20 days',
    1200000, 'GBP', 33, 1, 34, 'Webinar', img_webinar, 'Review contract', current_date + interval '3 days', owner_id, owner_id),
  (prop_charity, ws_id, lead_charity, 'Children First Charity Gala', 'Emma Scott', 'emma.scott@childrenfirst.org.uk',
    'Charity', current_date + interval '6 months', 'Old Billingsgate, London', 400, 'declined', current_date + interval '10 days',
    3000000, 'GBP', 33, 1, 27, 'Charity', img_charity2, 'Review feedback', current_date + interval '1 day', owner_id, owner_id),
  (prop_summer, ws_id, lead_summer, 'Summer Beats Festival Proposal', 'Ben Roberts', 'ben.roberts@livenation.co.uk',
    'Festival', current_date + interval '11 months', 'Victoria Park, London', 5000, 'signed', current_date + interval '9 days',
    25000000, 'GBP', 33, 1, 33, 'Festival', img_festival, 'Send invoice', current_date, owner_id, owner_id)
  ON CONFLICT (id) DO UPDATE SET cover_image_url = EXCLUDED.cover_image_url;

  RAISE NOTICE 'Sales demo seed complete for workspace % (%).', ws_name, ws_id;
END $$;
