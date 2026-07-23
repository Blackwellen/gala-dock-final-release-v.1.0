-- =============================================================================
-- Gala Dock — Marketplace demo seed (venue/supplier workspaces + listings).
-- Idempotent: fixed UUIDs, ON CONFLICT DO NOTHING / re-runnable UPDATEs.
-- Reuses the existing demo user (81b8cf5e-...) as owner of several persona
-- workspaces — same login, switch workspace to see the venue/supplier side of
-- the marketplace, exactly like a real user running multiple businesses would.
-- Populates the shared marketplace_listings catalog so /event-manager/marketplace
-- (browse), /event-manager/marketplace/listings (my listings) and /build (the
-- consumer event builder) all have real, live, priced content instead of an
-- empty state. Images: real Unsplash URLs (marketplace_listings.cover_image_url
-- is a plain text column, not R2-backed, so external stock URLs are the
-- correct/expected shape here — see the marketplace_foundation migration).
-- ⚠️ Dev/staging only.
-- =============================================================================

DO $$
DECLARE
  owner_id uuid := '81b8cf5e-8f46-485a-b5b1-58f51d6109d7';

  ws_venue_barn     uuid := 'a0a10001-0000-0000-0000-000000000001'; -- The Oak Barn (venue)
  ws_venue_garden   uuid := 'a0a10001-0000-0000-0000-000000000002'; -- Willowmere Gardens (venue)
  ws_sup_catering   uuid := 'a0a10001-0000-0000-0000-000000000003'; -- Coastal Grill Co. (catering)
  ws_sup_bouncy     uuid := 'a0a10001-0000-0000-0000-000000000004'; -- Big Top Bouncy Castles (play/activity)
  ws_sup_magic      uuid := 'a0a10001-0000-0000-0000-000000000005'; -- Marvin the Magnificent (entertainment)
  ws_sup_balloons   uuid := 'a0a10001-0000-0000-0000-000000000006'; -- Bloom & Balloon Co. (decor)
  ws_sup_photo      uuid := 'a0a10001-0000-0000-0000-000000000007'; -- Shutter & Co. Photography
  ws_sup_dj         uuid := 'a0a10001-0000-0000-0000-000000000008'; -- DJ Pulse Events (entertainment)
BEGIN
  INSERT INTO public.workspaces (id, name, slug, owner_user_id, workspace_type, currency, country) VALUES
  ( ws_venue_barn,   'The Oak Barn',              'the-oak-barn',              owner_id, 'venue',    'GBP', 'GB' ),
  ( ws_venue_garden, 'Willowmere Gardens',        'willowmere-gardens',        owner_id, 'venue',    'GBP', 'GB' ),
  ( ws_sup_catering, 'Coastal Grill Co.',         'coastal-grill-co',          owner_id, 'supplier', 'GBP', 'GB' ),
  ( ws_sup_bouncy,   'Big Top Bouncy Castles',    'big-top-bouncy-castles',    owner_id, 'supplier', 'GBP', 'GB' ),
  ( ws_sup_magic,    'Marvin the Magnificent',    'marvin-the-magnificent',    owner_id, 'supplier', 'GBP', 'GB' ),
  ( ws_sup_balloons, 'Bloom & Balloon Co.',       'bloom-and-balloon-co',      owner_id, 'supplier', 'GBP', 'GB' ),
  ( ws_sup_photo,    'Shutter & Co. Photography', 'shutter-and-co-photography',owner_id, 'supplier', 'GBP', 'GB' ),
  ( ws_sup_dj,       'DJ Pulse Events',           'dj-pulse-events',           owner_id, 'supplier', 'GBP', 'GB' )
  ON CONFLICT (id) DO UPDATE SET workspace_type = EXCLUDED.workspace_type;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT w.id, owner_id, 'owner'::public.workspace_role
  FROM (VALUES (ws_venue_barn), (ws_venue_garden), (ws_sup_catering), (ws_sup_bouncy), (ws_sup_magic), (ws_sup_balloons), (ws_sup_photo), (ws_sup_dj)) AS w(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id AND m.user_id = owner_id
  );

  INSERT INTO public.marketplace_listings (
    id, workspace_id, category, title, description, price_from_cents, price_unit, currency,
    cover_image_url, coverage_regions, status, rating_avg, rating_count
  ) VALUES
  ( 'b0b10001-0000-0000-0000-000000000001', ws_venue_barn, 'venue', 'The Oak Barn — Exclusive Hire',
    'A restored 18th-century barn with exposed beams, fairy lights and space for up to 120 guests. Available for full-day exclusive hire.',
    180000, 'per_day', 'GBP',
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80',
    ARRAY['Kent','Surrey','South London'], 'live', 4.8, 34 ),

  ( 'b0b10001-0000-0000-0000-000000000002', ws_venue_garden, 'venue', 'Willowmere Gardens — Marquee Lawn',
    'Two acres of landscaped gardens with a private marquee lawn, ideal for weddings, christenings and summer parties.',
    95000, 'per_day', 'GBP',
    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&q=80',
    ARRAY['Surrey','Hampshire'], 'live', 4.6, 21 ),

  ( 'b0b10001-0000-0000-0000-000000000003', ws_sup_catering, 'catering', 'Coastal Grill Co. — BBQ Hire',
    'Wood-fired BBQ catering for garden parties and celebrations — burgers, seafood and vegetarian options, staffed and served.',
    1800, 'per_head', 'GBP',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
    ARRAY['London','Surrey','Kent'], 'live', 4.9, 58 ),

  ( 'b0b10001-0000-0000-0000-000000000004', ws_sup_bouncy, 'play_activity', 'The Big Top Bouncy Castle',
    'A giant bouncy castle with a circus theme, delivered, set up and collected the same day. Suitable for ages 3–12.',
    12000, 'fixed', 'GBP',
    'https://images.unsplash.com/photo-1573982441320-be05e0d9c04b?w=800&q=80',
    ARRAY['London','Essex','Hertfordshire'], 'live', 4.7, 112 ),

  ( 'b0b10001-0000-0000-0000-000000000005', ws_sup_bouncy, 'play_activity', 'Soft Play Package (Under 5s)',
    'A full soft-play package for toddlers — ball pit, climbing frame and slide, indoor or outdoor.',
    9500, 'fixed', 'GBP',
    'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800&q=80',
    ARRAY['London','Essex'], 'live', 4.8, 76 ),

  ( 'b0b10001-0000-0000-0000-000000000006', ws_sup_magic, 'entertainment', 'Marvin the Magnificent — Kids'' Magic Show',
    'A 45-minute interactive magic show for children''s parties, full of laughs, tricks and balloon animals.',
    15000, 'fixed', 'GBP',
    'https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=800&q=80',
    ARRAY['London','Surrey'], 'live', 5.0, 89 ),

  ( 'b0b10001-0000-0000-0000-000000000007', ws_sup_balloons, 'decor_styling', 'Balloon Arch & Styling Package',
    'A full balloon arch, table styling and backdrop for birthdays, christenings and baby showers.',
    22000, 'fixed', 'GBP',
    'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80',
    ARRAY['London','Kent','Surrey'], 'live', 4.9, 47 ),

  ( 'b0b10001-0000-0000-0000-000000000008', ws_sup_photo, 'photo_video', 'Family Event Photography — Half Day',
    'A professional photographer for up to 4 hours, all edited digital images delivered within a week.',
    35000, 'fixed', 'GBP',
    'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80',
    ARRAY['London','Surrey','Kent','Essex'], 'live', 4.8, 63 ),

  ( 'b0b10001-0000-0000-0000-000000000009', ws_sup_dj, 'entertainment', 'DJ Pulse — Party DJ & Sound System',
    'A professional DJ with a full PA system and lighting rig, for birthdays, engagements and private parties.',
    30000, 'fixed', 'GBP',
    'https://images.unsplash.com/photo-1571266028243-d220c9c3b31b?w=800&q=80',
    ARRAY['London','Essex','Hertfordshire'], 'live', 4.7, 95 ),

  ( 'b0b10001-0000-0000-0000-000000000010', ws_sup_catering, 'catering', 'Celebration Cake — Custom Design',
    'A custom-designed celebration cake, made to order, feeds up to 40 guests.',
    9000, 'fixed', 'GBP',
    'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&q=80',
    ARRAY['London','Surrey'], 'live', 4.9, 41 )
  ON CONFLICT (id) DO UPDATE SET
    price_from_cents = EXCLUDED.price_from_cents,
    cover_image_url = EXCLUDED.cover_image_url,
    status = EXCLUDED.status;
END $$;
