-- =============================================================================
-- Gala Dock — Public event pages + ticketing demo seed.
-- Idempotent: fixed UUIDs, ON CONFLICT DO NOTHING / re-runnable UPDATEs.
-- Publishes 4 REAL existing demo events (from demo-events-full-seed.sql, same
-- "Grannit Holdings" workspace) so /discover, the homepage featured-events rail
-- and each /e/[slug] public page have real, browsable, ticketable content —
-- previously these surfaces were empty because nothing had ever been published.
-- Hero/gallery images reuse the same Unsplash URLs already assigned to these
-- events' cover_image_url in demo-events-full-seed.sql (known-good, no new
-- unverified image URLs introduced).
-- ⚠️ Dev/staging only.
-- =============================================================================

DO $$
DECLARE
  ws_id    uuid := '045a53a6-d421-4836-bf9e-e7a5cf998834';
  owner_id uuid := '81b8cf5e-8f46-485a-b5b1-58f51d6109d7';

  ev_tech      uuid := 'eeee0001-0000-0000-0000-000000000001'; -- Global Tech Summit 2026
  ev_hartley   uuid := 'eeee0001-0000-0000-0000-000000000002'; -- Hartley & Sons Annual Gala
  ev_grad      uuid := 'eeee0001-0000-0000-0000-000000000003'; -- Northbridge Graduation Ball
  ev_fashion   uuid := 'eeee0001-0000-0000-0000-000000000005'; -- Savoy Fashion Week After Party

  pp_tech    uuid := 'fff10001-0000-0000-0000-000000000001';
  pp_hartley uuid := 'fff10001-0000-0000-0000-000000000002';
  pp_grad    uuid := 'fff10001-0000-0000-0000-000000000003';
  pp_fashion uuid := 'fff10001-0000-0000-0000-000000000005';

  img_tech    text := 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80';
  img_hartley text := 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1200&q=80';
  img_grad    text := 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=1200&q=80';
  img_fashion text := 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=80';
BEGIN
  -- Only seed if the parent demo events exist (keeps this seed safely optional/idempotent
  -- against a database that hasn't run demo-events-full-seed.sql).
  IF EXISTS (SELECT 1 FROM public.events WHERE id = ev_tech) THEN

    INSERT INTO public.event_public_pages (
      id, workspace_id, event_id, slug, headline, summary, published,
      category, event_type, city, country, starts_at, ends_at, doors_at,
      venue_name, hero_path, gallery_paths, lineup, schedule, faqs, policies,
      accessibility_features, age_restriction, organiser_name, promoted,
      seo_title, seo_description
    ) VALUES
    ( pp_tech, ws_id, ev_tech, 'global-tech-summit-2026',
      'Global Tech Summit 2026', 'Three days of keynotes, workshops and networking with 1,200+ technology leaders at ExCeL London.', true,
      'conference', 'conference', 'London', 'United Kingdom', '2026-09-15 09:00:00+01', '2026-09-17 18:00:00+01', '2026-09-15 08:00:00+01',
      'ExCeL London', img_tech, jsonb_build_array(img_tech),
      jsonb_build_array(
        jsonb_build_object('name', 'Dr. Amara Osei', 'role', 'Keynote — AI & the Future of Work', 'stage', 'Main Stage'),
        jsonb_build_object('name', 'Marcus Chen', 'role', 'Panel — Scaling Engineering Teams', 'stage', 'Stage 2')
      ),
      jsonb_build_array(
        jsonb_build_object('time', '09:00', 'title', 'Doors open & registration'),
        jsonb_build_object('time', '10:00', 'title', 'Opening keynote'),
        jsonb_build_object('time', '18:00', 'title', 'Day one networking reception')
      ),
      jsonb_build_array(
        jsonb_build_object('question', 'Is there parking on site?', 'answer', 'Yes, ExCeL London has on-site parking (pre-booking recommended).'),
        jsonb_build_object('question', 'Can I get a VAT invoice?', 'answer', 'Yes — a VAT invoice is emailed automatically after checkout.')
      ),
      jsonb_build_object('refundPolicy', 'Refundable up to 14 days before the event.', 'reEntry', 'Wristband required for re-entry each day.'),
      jsonb_build_array('Wheelchair accessible venue', 'Hearing loop available', 'Accessible toilets'),
      NULL, 'Gala Dock Events', true,
      'Global Tech Summit 2026 — Tickets', 'Join 1,200+ technology leaders at ExCeL London, 15–17 September 2026.'
    ),
    ( pp_hartley, ws_id, ev_hartley, 'hartley-sons-annual-gala-2026',
      'Hartley & Sons Annual Gala', 'An elegant evening of fine dining and celebration at The Shard, overlooking the London skyline.', true,
      'private', 'private_party', 'London', 'United Kingdom', '2026-11-21 19:00:00+00', '2026-11-21 23:30:00+00', '2026-11-21 18:30:00+00',
      'The Shard', img_hartley, jsonb_build_array(img_hartley),
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('time', '18:30', 'title', 'Doors & drinks reception'),
        jsonb_build_object('time', '19:30', 'title', 'Dinner served'),
        jsonb_build_object('time', '21:30', 'title', 'Awards & speeches')
      ),
      '[]'::jsonb,
      jsonb_build_object('refundPolicy', 'Non-refundable within 7 days of the event.', 'lastEntry', '20:00'),
      jsonb_build_array('Wheelchair accessible venue'),
      NULL, 'Hartley & Sons LLP', false,
      'Hartley & Sons Annual Gala 2026 — Tickets', 'An elegant black-tie evening at The Shard, 21 November 2026.'
    ),
    ( pp_grad, ws_id, ev_grad, 'northbridge-graduation-ball-2026',
      'Northbridge University Graduation Ball', 'Celebrate the Class of 2026 with a night of dining, dancing and live music at Battersea Power Station.', true,
      'private', 'private_party', 'London', 'United Kingdom', '2026-06-27 18:30:00+01', '2026-06-27 23:59:00+01', '2026-06-27 18:00:00+01',
      'Battersea Power Station', img_grad, jsonb_build_array(img_grad),
      jsonb_build_array(jsonb_build_object('name', 'The Riverside Collective', 'role', 'Live band', 'stage', 'Main Hall')),
      jsonb_build_array(
        jsonb_build_object('time', '18:00', 'title', 'Doors open'),
        jsonb_build_object('time', '19:00', 'title', 'Three-course dinner'),
        jsonb_build_object('time', '21:30', 'title', 'Live band & dancing')
      ),
      jsonb_build_array(jsonb_build_object('question', 'What is the dress code?', 'answer', 'Black tie / formal.')),
      jsonb_build_object('ageRestriction', '18+', 'refundPolicy', 'Refundable up to 30 days before the event.'),
      jsonb_build_array('Wheelchair accessible venue', 'Accessible toilets'),
      '18+', 'Northbridge University Students'' Union', false,
      'Northbridge Graduation Ball 2026 — Tickets', 'Celebrate the Class of 2026 at Battersea Power Station, 27 June 2026.'
    ),
    ( pp_fashion, ws_id, ev_fashion, 'savoy-fashion-week-after-party-2026',
      'Savoy Fashion Week After Party', 'The official Fashion Week closing party — DJs, cocktails and a late-night crowd at Tobacco Dock.', true,
      'nightlife', 'private_party', 'London', 'United Kingdom', '2026-09-20 22:00:00+01', '2026-09-21 03:00:00+01', '2026-09-20 21:30:00+01',
      'Tobacco Dock', img_fashion, jsonb_build_array(img_fashion),
      jsonb_build_array(jsonb_build_object('name', 'DJ Nova', 'role', 'Headline set', 'stage', 'Main Room', 'startsAt', '2026-09-21T00:00:00+01:00')),
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('question', 'Is there a dress code?', 'answer', 'Fashion-forward smart — no trainers or sportswear.')),
      jsonb_build_object('ageRestriction', '18+', 'bagPolicy', 'Small bags only, subject to search.', 'reEntry', 'No re-entry after 1am.'),
      '[]'::jsonb,
      '18+', 'House of Renard', true,
      'Savoy Fashion Week After Party 2026 — Tickets', 'The official closing party of London Fashion Week, 20 September 2026.'
    )
    ON CONFLICT (id) DO UPDATE SET
      published = EXCLUDED.published,
      hero_path = EXCLUDED.hero_path,
      gallery_paths = EXCLUDED.gallery_paths,
      promoted = EXCLUDED.promoted;

    -- Ticket tiers — real inventory, on_sale, GBP.
    INSERT INTO public.ticket_types (id, workspace_id, event_id, name, description, price_cents, currency, quantity, sold, status) VALUES
    ( 'fff20001-0000-0000-0000-000000000001', ws_id, ev_tech, 'General Admission', 'Full 3-day access to all keynotes and workshops.', 24900, 'GBP', 800, 214, 'on_sale' ),
    ( 'fff20001-0000-0000-0000-000000000002', ws_id, ev_tech, 'VIP Pass', 'General admission plus VIP lounge, reserved seating and speaker meet & greet.', 59900, 'GBP', 100, 37, 'on_sale' ),
    ( 'fff20001-0000-0000-0000-000000000003', ws_id, ev_hartley, 'Gala Ticket', 'Includes welcome drinks, three-course dinner and after-dinner entertainment.', 18500, 'GBP', 350, 288, 'on_sale' ),
    ( 'fff20001-0000-0000-0000-000000000004', ws_id, ev_grad, 'Graduation Ball Ticket', 'Dinner, live band and dancing — Class of 2026.', 8500, 'GBP', 800, 641, 'on_sale' ),
    ( 'fff20001-0000-0000-0000-000000000005', ws_id, ev_fashion, 'Early Bird', 'Limited early-bird release.', 3500, 'GBP', 150, 150, 'sold_out' ),
    ( 'fff20001-0000-0000-0000-000000000006', ws_id, ev_fashion, 'General Entry', 'Standard entry from 10pm.', 5500, 'GBP', 450, 203, 'on_sale' )
    ON CONFLICT (id) DO UPDATE SET
      price_cents = EXCLUDED.price_cents,
      quantity = EXCLUDED.quantity,
      sold = EXCLUDED.sold,
      status = EXCLUDED.status;

    -- One live promo code, for the checkout promo-code flow to have something real to validate.
    INSERT INTO public.ticket_promo_codes (id, workspace_id, event_id, code, percent_off, active) VALUES
    ( 'fff30001-0000-0000-0000-000000000001', ws_id, ev_tech, 'TECH2026', 15, true )
    ON CONFLICT (id) DO NOTHING;

  END IF;
END $$;
