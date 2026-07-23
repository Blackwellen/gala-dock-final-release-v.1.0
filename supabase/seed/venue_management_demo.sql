-- =============================================================================
-- GALA DOCK — Venues Section Demo Seed
-- Run in Supabase SQL Editor (one click → Run), or:
--   supabase db query --linked -f supabase/seed/venue_management_demo.sql
-- Self-contained: uses the first workspace found. Idempotent — deletes any
-- previous rows for these three demo venue names in that workspace before
-- re-inserting, so this can be re-run safely at any time.
-- Recreates the states shown in docs/design-reference/venue-section-reference-map.md.
-- =============================================================================

DO $$
DECLARE
  v_ws   uuid;
  v_user uuid;
  v_cat_historic uuid;
  v_cat_waterfront uuid;
  v_cat_warehouse uuid;

  venue_grand_hall uuid := gen_random_uuid();
  venue_riverside  uuid := gen_random_uuid();
  venue_north_dock uuid := gen_random_uuid();

  space_grand_hall uuid := gen_random_uuid();
  space_riverside_pav uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_ws FROM public.workspaces LIMIT 1;
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'No workspace found — create a workspace first.'; END IF;

  -- ── clean up any previous run of this seed ─────────────────────────────────
  DELETE FROM public.venues
  WHERE workspace_id = v_ws
    AND name IN ('Grand Hall London', 'Riverside Pavilion', 'North Dock Warehouse');

  -- ── venue categories (reuse if present, else create scoped to this workspace) ──
  -- Fixed in 20260713_fix_audit_venue_category_trigger.sql: audit_venue_category()
  -- previously hard-failed every insert because public.admin_action_log doesn't
  -- exist; it now swallows audit failures the same way _venue_attachments_audit()
  -- already did, so category creation works again.
  SELECT id INTO v_cat_historic FROM public.venue_categories WHERE workspace_id = v_ws AND name = 'Historic Venue' LIMIT 1;
  IF v_cat_historic IS NULL THEN
    INSERT INTO public.venue_categories (id, workspace_id, name, color, position, created_by)
    VALUES (gen_random_uuid(), v_ws, 'Historic Venue', '#6366f1', 0, v_user) RETURNING id INTO v_cat_historic;
  END IF;
  SELECT id INTO v_cat_waterfront FROM public.venue_categories WHERE workspace_id = v_ws AND name = 'Waterside Venue' LIMIT 1;
  IF v_cat_waterfront IS NULL THEN
    INSERT INTO public.venue_categories (id, workspace_id, name, color, position, created_by)
    VALUES (gen_random_uuid(), v_ws, 'Waterside Venue', '#0ea5e9', 1, v_user) RETURNING id INTO v_cat_waterfront;
  END IF;
  SELECT id INTO v_cat_warehouse FROM public.venue_categories WHERE workspace_id = v_ws AND name = 'Warehouse' LIMIT 1;
  IF v_cat_warehouse IS NULL THEN
    INSERT INTO public.venue_categories (id, workspace_id, name, color, position, created_by)
    VALUES (gen_random_uuid(), v_ws, 'Warehouse', '#78716c', 2, v_user) RETURNING id INTO v_cat_warehouse;
  END IF;

  -- ===========================================================================
  -- 1. VENUES
  -- ===========================================================================
  INSERT INTO public.venues (
    id, workspace_id, created_by, name, status, category_id, website,
    address_line1, city, region, postal_code, country, capacity,
    contact_email, contact_phone, notes,
    is_preferred, is_verified, rating, suitability_score, response_time_hours,
    avg_spend_cents, last_used_at, preferred_since, preferred_reason, preferred_by,
    review_date, what3words, latitude, longitude, best_fit_event_types
  ) VALUES
  (
    venue_grand_hall, v_ws, v_user, 'Grand Hall London', 'active', v_cat_historic,
    'https://grandhall.london',
    '1 Grand Hall Way', 'London', 'SE1', 'SE1 0AA', 'United Kingdom', 600,
    'olivia@grandhall.london', '+44 7700 900123',
    'Grade II listed landmark on the banks of the Thames. Blends timeless architecture with modern event excellence.',
    true, true, 4.7, 4.7, 6.2,
    1800000, now() - interval '3 days', (now() - interval '18 months')::date,
    'Excellent venue for large conferences and gala dinners. Great service team and very flexible with theming and AV.',
    v_user, (current_date + interval '11 months')::date, '///vivid.river.smooth', 51.5045, -0.0865,
    '["Gala Dinners","Conferences","Awards Ceremonies","Product Launches"]'::jsonb
  ),
  (
    venue_riverside, v_ws, v_user, 'Riverside Pavilion', 'active', v_cat_waterfront,
    'https://riversidepavilion.co.uk',
    '14 Riverside Walk', 'London', 'W6', 'W6 9HA', 'United Kingdom', 500,
    'james@riversidepavilion.co.uk', '+44 7711 223344',
    'Glass-walled waterside pavilion popular for receptions and corporate offsites.',
    true, true, 4.5, 4.4, 8.1,
    1200000, now() - interval '40 days', (now() - interval '9 months')::date,
    'Reliable for mid-size receptions; on-hold status pending confirmation of a repeat client date.',
    v_user, (current_date + interval '7 months')::date, '///glass.riverside.walk', 51.4920, -0.2280,
    '["Corporate Parties","Conferences","Team Offsites","Networking Events"]'::jsonb
  ),
  (
    venue_north_dock, v_ws, v_user, 'North Dock Warehouse', 'active', v_cat_warehouse,
    'https://northdockwarehouse.co.uk',
    '8 North Dock Road', 'Manchester', 'M4', 'M4 5AA', 'United Kingdom', 1200,
    'sophie@northdockwarehouse.co.uk', '+44 7712 334455',
    'Industrial-aesthetic warehouse with flexible layouts and a dedicated loading bay for large-scale product launches.',
    true, true, 4.4, 4.3, 4.5,
    1500000, now() - interval '14 days', (now() - interval '6 months')::date,
    'Strong choice for product launches and experiential events needing large floor plates.',
    v_user, (current_date + interval '9 months')::date, null, 53.4770, -2.2420,
    '["Product Launches","Exhibitions","Experiential Events"]'::jsonb
  );

  -- ===========================================================================
  -- 2. CONTACTS
  -- ===========================================================================
  INSERT INTO public.venue_contacts (workspace_id, venue_id, name, role, email, phone, is_primary, created_by) VALUES
  (v_ws, venue_grand_hall, 'Olivia Bennett', 'Venue Director', 'olivia@grandhall.london', '+44 7700 900123', true, v_user),
  (v_ws, venue_grand_hall, 'James Carter', 'Sales Manager', 'james@grandhall.london', '+44 7700 900124', false, v_user),
  (v_ws, venue_grand_hall, 'Sophie Williams', 'Head of Operations', 'sophie@grandhall.london', '+44 7700 900125', false, v_user),
  (v_ws, venue_riverside, 'James Carter', 'General Manager', 'james@riversidepavilion.co.uk', '+44 7711 223344', true, v_user),
  (v_ws, venue_north_dock, 'Sophie Williams', 'Events Manager', 'sophie@northdockwarehouse.co.uk', '+44 7712 334455', true, v_user);

  -- ===========================================================================
  -- 3. SPACES
  -- ===========================================================================
  INSERT INTO public.venue_spaces (
    id, workspace_id, venue_id, name, space_type, description,
    capacity_seated, capacity_standing, theatre_capacity, banquet_capacity,
    dimensions, area_sqm, av_readiness, accessibility, preferred_uses, amenities, sort_order
  ) VALUES
  (space_grand_hall, v_ws, venue_grand_hall, 'Grand Hall', 'Ballroom', 'Iconic domed hall with classical architecture.',
   800, 1200, 900, 800, '31m x 24m x 18m', 744, 'Fully Equipped', 'Fully Accessible',
   '["Gala Dinners","Conferences","Awards","Exhibitions"]'::jsonb, '["Wifi","Catering","AV","Stage"]'::jsonb, 0),
  (space_riverside_pav, v_ws, venue_grand_hall, 'Riverside Pavilion', 'Ballroom', 'Glass-walled space with river views.',
   400, 600, 450, 400, '24m x 16m x 6.5m', 384, 'AV Ready', 'Fully Accessible',
   '["Receptions","Conferences","Private Dining"]'::jsonb, '["Wifi","Catering"]'::jsonb, 1),
  (gen_random_uuid(), v_ws, venue_riverside, 'Main Pavilion', 'Reception', 'Waterside reception space with outdoor terrace.',
   350, 500, 400, 350, '20m x 14m x 5m', 280, 'AV Ready', 'Step-free access', '["Receptions","Networking"]'::jsonb, '["Wifi","Outdoor Terrace"]'::jsonb, 0),
  (gen_random_uuid(), v_ws, venue_north_dock, 'Main Floor', 'Warehouse Floor', 'Open industrial floor plate for large launches.',
   800, 1200, 1000, 800, '40m x 25m x 9m', 1000, 'Fully Equipped', 'Fully Accessible', '["Product Launches","Exhibitions"]'::jsonb, '["Loading Bay","High Ceilings"]'::jsonb, 0);

  -- ===========================================================================
  -- 4. MEDIA (external CDN images — no R2 upload needed for demo)
  -- ===========================================================================
  INSERT INTO public.venue_media (workspace_id, venue_id, space_id, category, r2_key, alt_text, is_cover, sort_order, created_by) VALUES
  (v_ws, venue_grand_hall, space_grand_hall, 'gallery', 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1200', 'Grand Hall domed ceiling', true, 0, v_user),
  (v_ws, venue_grand_hall, space_grand_hall, 'gallery', 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200', 'Riverside terrace at sunset', false, 1, v_user),
  (v_ws, venue_riverside, null, 'gallery', 'https://images.unsplash.com/photo-1465447142348-e9952c393450?w=1200', 'Riverside Pavilion exterior', true, 0, v_user),
  (v_ws, venue_north_dock, null, 'gallery', 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1200', 'North Dock Warehouse interior', true, 0, v_user);

  -- ===========================================================================
  -- 5. DOCUMENTS
  -- ===========================================================================
  INSERT INTO public.venue_documents (workspace_id, venue_id, doc_type, category, filename, storage_key, file_size_bytes, expiry_date, status, version, is_current, uploaded_by) VALUES
  (v_ws, venue_grand_hall, 'hire-agreement', 'contracts', 'Master Services Agreement.pdf', v_ws || '/' || venue_grand_hall || '/hire-agreement/demo-msa.pdf', 1258291, null, 'active', 3, true, v_user),
  (v_ws, venue_grand_hall, 'floorplan', 'floor_plans', 'Floor Plan - Ground Floor.pdf', v_ws || '/' || venue_grand_hall || '/floorplan/demo-floor.pdf', 2516582, null, 'active', 2, true, v_user),
  (v_ws, venue_grand_hall, 'insurance', 'insurance', 'Insurance Certificate 2025.pdf', v_ws || '/' || venue_grand_hall || '/insurance/demo-insurance.pdf', 1048576, (current_date + interval '45 days')::date, 'expiring-soon', 1, true, v_user),
  (v_ws, venue_grand_hall, 'capacity-certificate', 'technical_specs', 'Technical Specification.pdf', v_ws || '/' || venue_grand_hall || '/capacity-certificate/demo-tech.pdf', 4404019, null, 'active', 2, true, v_user),
  (v_ws, venue_riverside, 'hire-agreement', 'contracts', 'Riverside Pavilion Hire Agreement.pdf', v_ws || '/' || venue_riverside || '/hire-agreement/demo-hire.pdf', 987654, null, 'active', 1, true, v_user);

  -- ===========================================================================
  -- 6. NOTES
  -- ===========================================================================
  INSERT INTO public.venue_notes (workspace_id, venue_id, body, note_type, is_pinned, created_by, created_at) VALUES
  (v_ws, venue_grand_hall, 'Beautiful venue with strong heritage and wow factor. Stunning main hall with incredible natural light and ornate detailing. Perfect for high-end gala dinners and awards. Client loved it.', 'general', true, v_user, now() - interval '3 days'),
  (v_ws, venue_grand_hall, 'Site visit completed – conducted full tour with Emma (Sales Manager). Reviewed Grand Hall, Riverside Pavilion, and Glasshouse Terrace.', 'site_visit', false, v_user, now() - interval '6 days'),
  (v_ws, venue_grand_hall, 'Call summary with Emma – discussed availability w/c 12 May. Flexible on F&B minimum for midweek events. Audio visual by preferred supplier only.', 'call_summary', false, v_user, now() - interval '9 days'),
  (v_ws, venue_grand_hall, 'Board meeting debrief – Client Board impressed with venue quality and central location. Budget alignment looks positive. Next step: finalise menu.', 'commercial', false, v_user, now() - interval '10 days'),
  (v_ws, venue_grand_hall, 'Fire alarm test scheduled every Wednesday at 11:00. Could impact audio during that window. Make clients aware.', 'logistics', true, v_user, now() - interval '13 days'),
  (v_ws, venue_riverside, 'Reliable partner for mid-size receptions. Negotiated preferential weekday rates and reduced F&B minimums for non-exclusive use.', 'commercial', true, v_user, now() - interval '2 days');

  -- ===========================================================================
  -- 7. ACTIVITY LOG
  -- ===========================================================================
  INSERT INTO public.venue_activity_log (workspace_id, venue_id, activity_type, title, description, actor_id, outcome, source, created_at) VALUES
  (v_ws, venue_grand_hall, 'venue_created', 'Venue created', 'Grand Hall London was created and added to Gala Dock.', v_user, null, 'app', now() - interval '18 months'),
  (v_ws, venue_grand_hall, 'preferred_status_changed', 'Preferred status changed', 'Venue status changed to Preferred.', v_user, null, 'app', now() - interval '17 months'),
  (v_ws, venue_grand_hall, 'note_added', 'Note added', 'Beautiful venue with strong heritage and wow factor.', v_user, null, 'app', now() - interval '3 days'),
  (v_ws, venue_grand_hall, 'document_uploaded', 'Contract uploaded', 'Master Services Agreement.pdf uploaded.', v_user, null, 'app', now() - interval '9 days'),
  (v_ws, venue_grand_hall, 'commercial_transaction_recorded', 'Deposit recorded', 'Deposit of £5,000 recorded.', v_user, null, 'app', now() - interval '9 days'),
  (v_ws, venue_grand_hall, 'suitability_score_updated', 'Suitability score updated', 'Suitability score updated from 4.2 to 4.7.', null, null, 'automated', now() - interval '20 days');

  -- ===========================================================================
  -- 8. ACCESS DETAILS
  -- ===========================================================================
  INSERT INTO public.venue_access_details (
    workspace_id, venue_id, main_entrance, secondary_entrance, event_entrance,
    access_hours, on_site_parking, nearest_car_park, coach_parking, nearest_station,
    loading_bay, loading_bay_height_m, loading_access_hours, vehicle_restrictions, dock_leveller,
    step_free_access, accessible_toilets, passenger_lifts, hearing_loop, accessible_parking,
    travel_times, nearby_hotels, logistics_reminders, local_area_notes
  ) VALUES (
    v_ws, venue_grand_hall, 'Belvedere Road (SE1 8XX)', 'Riverside Walk (SE1 7PB)', 'South Gallery Entrance',
    '06:00 – 23:00 (events)', '25 spaces (pre-book only)', 'Q-Park Southbank (0.2 miles, 3 min walk)', 'Belvedere Road Coach Bay (2 min walk)', 'London Waterloo',
    'Riverside Service Yard', 3.8, '06:00 – 20:00', 'Max 7.5T', true,
    true, true, 3, true, true,
    '[{"label":"London Waterloo Station","value":"6 min walk"},{"label":"Embankment Station","value":"9 min walk"},{"label":"London Bridge Station","value":"11 min walk"},{"label":"London City Airport","value":"38 min drive"},{"label":"Heathrow Airport (LHR)","value":"52 min drive"}]'::jsonb,
    '[{"name":"Sea Containers London","distance":"0.2 miles · 4★"},{"name":"Park Plaza Westminster","distance":"0.4 miles · 4★"},{"name":"The Savoy","distance":"0.6 miles · 5★"},{"name":"CitizenM London Bankside","distance":"0.3 miles · 4★"}]'::jsonb,
    '["Deliveries by appointment only","Loading bay height restriction: 3.8m","Venue quiet hours: 23:00 – 07:00","All contractors must sign in at reception"]'::jsonb,
    'Located on London''s South Bank with excellent access to restaurants, landmarks and amenities. Nearby attractions: London Eye, National Theatre. Quiet riverside setting. Good mobile coverage.'
  );

  -- ===========================================================================
  -- 9. COMMERCIAL TERMS
  -- ===========================================================================
  INSERT INTO public.venue_commercial_terms (
    workspace_id, venue_id, hire_rate_from_cents, day_rate_cents, half_day_rate_cents,
    min_hire_hours, min_spend_weekday_cents, min_spend_weekend_cents,
    standard_deposit_pct, security_deposit_cents, deposit_refundable,
    payment_terms_days, final_balance_days, bar_deposit_cents, fb_minimum_cents,
    service_charge_pct, corkage_policy, cancellation_terms, supplier_restrictions,
    contract_status, contract_signed_date, contract_effective_date, contract_expiry_date,
    auto_renewal, notice_period_days, next_review_date, negotiation_notes
  ) VALUES (
    v_ws, venue_grand_hall, 350000, 195000, 97500,
    4, 900000, 1400000,
    25, 200000, true,
    30, 14, 200000, 8500,
    12.5, 'Not Permitted',
    '[{"band":"More than 180 days","charge":"Full refund of deposits"},{"band":"30–89 days","charge":"75% of estimated total"},{"band":"Less than 30 days","charge":"100% of estimated total"}]'::jsonb,
    '{"catering":"exclusive_in_house","av_production":"preferred_list","furniture":"preferred_list","floristry":"open"}'::jsonb,
    'contracted', (current_date - interval '2 months')::date, (current_date - interval '2 months')::date, (current_date + interval '10 months')::date,
    true, 60, (current_date + interval '10 months')::date,
    'Strong long-term partner with excellent service and high client satisfaction. Negotiated preferential weekday rates and reduced F&B minimums for non-exclusive use. Agreed flexibility on supplier access for corporate clients.'
  );

  -- ===========================================================================
  -- 10. COMMERCIAL TRANSACTIONS
  -- ===========================================================================
  INSERT INTO public.venue_commercial_transactions (workspace_id, venue_id, transaction_type, amount_cents, due_date, paid_status, notes, created_by, created_at) VALUES
  (v_ws, venue_grand_hall, 'venue_deposit', 575000, (current_date - interval '2 months'), 'paid', 'Contract deposit received', v_user, now() - interval '2 months'),
  (v_ws, venue_grand_hall, 'fb_deposit', 320000, (current_date - interval '1 month'), 'paid', 'Deposit against F&B minimum', v_user, now() - interval '1 month'),
  (v_ws, venue_grand_hall, 'security_deposit', 200000, (current_date - interval '3 weeks'), 'paid', 'Refunded after event', v_user, now() - interval '3 weeks'),
  (v_ws, venue_grand_hall, 'cancellation_fee', 450000, (current_date + interval '5 days'), 'overdue', 'Additional for extended hours', v_user, now() - interval '10 days'),
  (v_ws, venue_grand_hall, 'rate_review', 0, (current_date + interval '3 weeks'), 'open', 'Review updated rate card', v_user, now() - interval '5 days');

  -- ===========================================================================
  -- 11. HOLDS & ROOM BLOCKS
  -- ===========================================================================
  INSERT INTO public.venue_holds (workspace_id, venue_id, hold_type, status, start_at, end_at, expiry_date, deposit_cents, notes, created_by) VALUES
  (v_ws, venue_riverside, 'first_option', 'provisional', now() + interval '2 months', now() + interval '2 months' + interval '6 hours', (current_date + interval '10 days')::date, 100000, 'Provisional hold pending client confirmation.', v_user);

  INSERT INTO public.venue_room_blocks (workspace_id, venue_id, room_type, num_rooms, nightly_rate_cents, start_date, end_date, release_date, status, booking_code, notes, created_by) VALUES
  (v_ws, venue_north_dock, 'Standard Double', 20, 12000, (current_date + interval '2 months')::date, (current_date + interval '2 months' + interval '3 days')::date, (current_date + interval '5 weeks')::date, 'confirmed', 'ND-RB-2025-01', 'Room block for out-of-town crew ahead of product launch.', v_user);

  RAISE NOTICE 'Venue demo seed complete for workspace %', v_ws;
END $$;
