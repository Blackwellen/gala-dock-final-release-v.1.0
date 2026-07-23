-- Gala Dock — Marketplace Phase 4 demo seed (B2B corporate-events catalog).
--
-- Distinct from supabase/seeds/marketplace-demo-seed.sql (a consumer/family-event catalog —
-- Oak Barn, bouncy castles, etc. — never applied to this live database). This seed mirrors
-- src/lib/marketplace/fixtures.ts exactly (same names/slugs) so the Phase 2 UI, once switched
-- from fixtures to live Supabase reads, resolves the same URLs to real rows.
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE. Dev/staging only — clearly demo data.
--
-- "Floral & Co. Events" intentionally owns both the 4 venue listings AND a décor/styling
-- listing under one workspace, exactly like the fixture data's dual venue-operator/supplier
-- identity (see fixtures.ts VENUE_OWNERS comment) — marketplace_listings has no workspace_type
-- restriction on listing category, so one workspace can list both.

DO $$
DECLARE
  owner_id uuid := '81b8cf5e-8f46-485a-b5b1-58f51d6109d7'; -- jamahlthomas1996@gmail.com

  ws_floral    uuid := 'c0c20001-0000-0000-0000-000000000001'; -- Floral & Co. Events (venue operator + décor supplier)
  ws_lumiere   uuid := 'c0c20001-0000-0000-0000-000000000002';
  ws_taste     uuid := 'c0c20001-0000-0000-0000-000000000003';
  ws_spark     uuid := 'c0c20001-0000-0000-0000-000000000004';
  ws_premier   uuid := 'c0c20001-0000-0000-0000-000000000005';
  ws_illuminate uuid := 'c0c20001-0000-0000-0000-000000000006';
  ws_pristine  uuid := 'c0c20001-0000-0000-0000-000000000007';
  ws_guardian  uuid := 'c0c20001-0000-0000-0000-000000000008';
  ws_rhythm    uuid := 'c0c20001-0000-0000-0000-000000000009';
BEGIN
  INSERT INTO public.workspaces (id, name, slug, owner_user_id, workspace_type, currency, country, release_stage) VALUES
  ( ws_floral,     'Floral & Co. Events',        'floral-co-events-operator', owner_id, 'venue',    'GBP', 'GB', 'v2' ),
  ( ws_lumiere,    'Lumière Productions',        'lumiere-productions',       owner_id, 'supplier', 'GBP', 'GB', 'v2' ),
  ( ws_taste,      'Taste Catering',             'taste-catering',            owner_id, 'supplier', 'GBP', 'GB', 'v2' ),
  ( ws_spark,      'Spark Events',               'spark-events',              owner_id, 'supplier', 'GBP', 'GB', 'v2' ),
  ( ws_premier,    'Premier Event Staff',        'premier-event-staff',       owner_id, 'supplier', 'GBP', 'GB', 'v2' ),
  ( ws_illuminate, 'Illuminate Lighting',        'illuminate-lighting',       owner_id, 'supplier', 'GBP', 'GB', 'v2' ),
  ( ws_pristine,   'Pristine Clean Ltd',         'pristine-clean',            owner_id, 'supplier', 'GBP', 'GB', 'v2' ),
  ( ws_guardian,   'Guardian Security',          'guardian-security',         owner_id, 'supplier', 'GBP', 'GB', 'v2' ),
  ( ws_rhythm,     'Rhythm Entertainment',       'rhythm-entertainment',      owner_id, 'supplier', 'GBP', 'GB', 'v2' )
  ON CONFLICT (id) DO UPDATE SET workspace_type = EXCLUDED.workspace_type, release_stage = EXCLUDED.release_stage;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT w.id, owner_id, 'owner'::public.workspace_role
  FROM (VALUES (ws_floral), (ws_lumiere), (ws_taste), (ws_spark), (ws_premier), (ws_illuminate), (ws_pristine), (ws_guardian), (ws_rhythm)) AS w(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id AND m.user_id = owner_id
  );

  -- Venue listings (all under Floral & Co. Events, matching fixtures.ts VENUES[].ownerId)
  INSERT INTO public.marketplace_listings (
    id, workspace_id, category, title, slug, description, price_from_cents, price_unit, currency,
    cover_image_url, coverage_regions, status, rating_avg, rating_count,
    verified, featured, response_time_label, seated_capacity, standing_capacity, accessible, tags
  ) VALUES
  ( 'd0d30001-0000-0000-0000-000000000001', ws_floral, 'venue', 'The Riverfront Hotel', 'the-riverfront-hotel',
    'A striking riverside venue combining glass-walled event spaces with panoramic city views, purpose-built for galas, conferences and product launches.',
    1850000, 'fixed', 'GBP', null, ARRAY['London'], 'live', 4.8, 124,
    true, true, '2h', 500, 800, true, ARRAY['Riverside','AV','Catering'] ),

  ( 'd0d30001-0000-0000-0000-000000000002', ws_floral, 'venue', 'Grand Victoria Hall', 'grand-victoria-hall',
    'Built in 1887, Grand Victoria Hall is one of Manchester''s most iconic venues, with sweeping architecture and state-of-the-art production facilities.',
    2200000, 'fixed', 'GBP', null, ARRAY['Manchester'], 'live', 4.9, 256,
    true, false, '1h', 1200, 1800, true, ARRAY['Historic','Grade II Listed','In-house AV'] ),

  ( 'd0d30001-0000-0000-0000-000000000003', ws_floral, 'venue', 'Skyline Terrace', 'skyline-terrace',
    'A striking rooftop venue with panoramic city views, ideal for receptions and summer events.',
    780000, 'fixed', 'GBP', null, ARRAY['Birmingham'], 'live', 4.6, 58,
    false, false, '3h', 200, 300, true, ARRAY['Rooftop','Bar','Outdoor'] ),

  ( 'd0d30001-0000-0000-0000-000000000004', ws_floral, 'venue', 'The Capital Conference Centre', 'the-capital-conference-centre',
    'A modern, flexible conference centre in the heart of Edinburgh built for large-scale corporate events.',
    1290000, 'fixed', 'GBP', null, ARRAY['Edinburgh'], 'live', 4.8, 142,
    true, true, '2h', 800, 1000, true, ARRAY['Conference','AV','Breakout Rooms'] ),

  -- Supplier / service listings (one flagship service listing per supplier company, matching fixtures.ts)
  ( 'd0d30001-0000-0000-0000-000000000005', ws_floral, 'decor_styling', 'Premium Styling & Floral Package', 'premium-styling-package',
    'Full-service event design and production creating unforgettable experiences for corporate, luxury, and private clients.',
    120000, 'fixed', 'GBP', null, ARRAY['London','UK Wide'], 'live', 4.9, 256,
    true, false, '2h', null, null, null, ARRAY['Floral Design','Venue Styling','Table Décor','Installations'] ),

  ( 'd0d30001-0000-0000-0000-000000000006', ws_lumiere, 'logistics', 'Premium AV Production Package', 'premium-av-production-package',
    'A full-service AV production solution delivering exceptional sound, lighting, video, and staging for corporate events, conferences, and galas.',
    350000, 'fixed', 'GBP', null, ARRAY['UK Wide','Europe'], 'live', 4.8, 178,
    true, false, '1h', null, null, null, ARRAY['Sound','Lighting','Staging','Video Production'] ),

  ( 'd0d30001-0000-0000-0000-000000000007', ws_taste, 'catering', 'Signature Catering Package', 'signature-catering-package',
    'Award-winning event catering with sustainable, seasonal menus for corporate and private events.',
    2500, 'per_head', 'GBP', null, ARRAY['UK Wide'], 'live', 4.7, 213,
    true, false, '2h', null, null, null, ARRAY['Fine Dining','Canapés','Bar Service','Dietary Options'] ),

  ( 'd0d30001-0000-0000-0000-000000000008', ws_spark, 'extras', 'Event Staffing Package', 'event-staffing-package',
    'Professional, reliable event staff for seamless event delivery.',
    18000, 'per_head', 'GBP', null, ARRAY['UK Wide'], 'live', 4.8, 142,
    false, false, '1h', null, null, null, ARRAY['Event Staff','Hosts','Security Escorts'] ),

  ( 'd0d30001-0000-0000-0000-000000000009', ws_premier, 'extras', 'Premium Staffing Package', 'premium-staffing-package',
    'Professional, reliable event staff for seamless event delivery.',
    18000, 'per_head', 'GBP', null, ARRAY['London','UK Wide'], 'live', 4.8, 142,
    true, false, '<1h', null, null, null, ARRAY['Waitstaff','Bar Staff','Event Managers'] ),

  ( 'd0d30001-0000-0000-0000-000000000010', ws_illuminate, 'logistics', 'Event Lighting Package', 'event-lighting-package',
    'Bespoke lighting design that transforms venues for every kind of event.',
    90000, 'fixed', 'GBP', null, ARRAY['UK Wide'], 'live', 4.6, 88,
    false, false, '3h', null, null, null, ARRAY['Uplighting','Rigging','Dance Floor Lighting'] ),

  ( 'd0d30001-0000-0000-0000-000000000011', ws_pristine, 'extras', 'Event Cleaning Package', 'event-cleaning-package',
    'Reliable pre and post-event cleaning teams for venues of every size.',
    30000, 'fixed', 'GBP', null, ARRAY['UK Wide'], 'live', 4.7, 64,
    true, false, '2h', null, null, null, ARRAY['Post-Event Clean','Deep Clean','Waste Removal'] ),

  ( 'd0d30001-0000-0000-0000-000000000012', ws_guardian, 'extras', 'Event Security Package', 'event-security-package',
    'SIA-licensed security professionals for events of every scale.',
    22000, 'per_head', 'GBP', null, ARRAY['UK Wide'], 'live', 4.7, 120,
    true, false, '<1h', null, null, null, ARRAY['SIA Licensed','Door Supervisors','Close Protection'] ),

  ( 'd0d30001-0000-0000-0000-000000000013', ws_rhythm, 'entertainment', 'Live Entertainment Package', 'live-entertainment-package',
    'Live bands, DJs and hosts that set the tone for unforgettable events.',
    180000, 'fixed', 'GBP', null, ARRAY['UK Wide'], 'live', 4.8, 96,
    true, false, '1h', null, null, null, ARRAY['Live Band','DJ','MC Hosting'] )

  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    price_from_cents = EXCLUDED.price_from_cents,
    status = EXCLUDED.status,
    verified = EXCLUDED.verified,
    featured = EXCLUDED.featured,
    response_time_label = EXCLUDED.response_time_label,
    tags = EXCLUDED.tags;
END $$;
