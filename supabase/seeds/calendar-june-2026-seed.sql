-- =============================================================================
-- Gala Dock — Calendar June 2026 Seed
-- Idempotent: ON CONFLICT DO NOTHING on fixed UUIDs.
-- Populates tasks, run sheet events and more for calendar demo.
-- =============================================================================

DO $$
DECLARE
  ws_id    uuid := '045a53a6-d421-4836-bf9e-e7a5cf998834';
  owner_id uuid;

  -- Event IDs (already seeded)
  ev_pulse     uuid := 'eeee0001-0000-0000-0000-000000000001'; -- Pulse Summit multi-day Jun 15-21
  ev_theatre   uuid := 'eeee0001-0000-0000-0000-000000000002'; -- Theatre Gala Night Jun 11
  ev_festival  uuid := 'eeee0001-0000-0000-0000-000000000003'; -- Food Festival Jun 26
  ev_nightlife uuid := 'eeee0001-0000-0000-0000-000000000005'; -- After Dark Jun 13
  ev_gala      uuid := 'eeee0001-0000-0000-0000-000000000006'; -- Gala Dinner Jun 24

  -- Task UUIDs (calendar tasks — all for June 2026)
  t01 uuid := 'cc000001-0000-0000-0000-000000000001';
  t02 uuid := 'cc000001-0000-0000-0000-000000000002';
  t03 uuid := 'cc000001-0000-0000-0000-000000000003';
  t04 uuid := 'cc000001-0000-0000-0000-000000000004';
  t05 uuid := 'cc000001-0000-0000-0000-000000000005';
  t06 uuid := 'cc000001-0000-0000-0000-000000000006';
  t07 uuid := 'cc000001-0000-0000-0000-000000000007';
  t08 uuid := 'cc000001-0000-0000-0000-000000000008';
  t09 uuid := 'cc000001-0000-0000-0000-000000000009';
  t10 uuid := 'cc000001-0000-0000-0000-000000000010';
  t11 uuid := 'cc000001-0000-0000-0000-000000000011';
  t12 uuid := 'cc000001-0000-0000-0000-000000000012';

BEGIN
  SELECT user_id INTO owner_id
  FROM public.workspace_members
  WHERE workspace_id = ws_id
  LIMIT 1;

  IF owner_id IS NULL THEN
    RAISE NOTICE 'No workspace member found for ws_id %. Skipping.', ws_id;
    RETURN;
  END IF;

  -- ==========================================================================
  -- PULSE SUMMIT — Update to ensure it spans Jun 15–21 2026 correctly
  -- ==========================================================================
  UPDATE public.events
  SET
    start_at   = '2026-06-15 09:00:00+01',
    end_at     = '2026-06-21 23:59:00+01',
    event_type = 'conference',
    status     = 'confirmed',
    venue_name_snapshot    = 'ExCeL London',
    venue_address_snapshot = 'Royal Victoria Dock, London E16 1XL',
    location               = 'London',
    guest_count_day        = 1250,
    budget_cents           = 42000000,
    cover_image_url        = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
    tags                   = ARRAY['corporate','conference','hybrid','vip']
  WHERE id = ev_pulse AND workspace_id = ws_id;

  -- ==========================================================================
  -- TASKS — June 2026 (all linked to events, with due_at dates in June)
  -- ==========================================================================
  INSERT INTO public.tasks (
    id, workspace_id, event_id,
    title, status, priority, due_at,
    created_by, created_at, updated_at
  ) VALUES

  -- Pulse Summit tasks
  (t01, ws_id, ev_pulse, 'Finalise AV setup and stage layout', 'todo', 'p1',
   '2026-06-09 17:00:00+01', owner_id, now(), now()),

  (t02, ws_id, ev_pulse, 'Send keynote speaker briefing packs', 'in_progress', 'p1',
   '2026-06-10 12:00:00+01', owner_id, now(), now()),

  (t03, ws_id, ev_pulse, 'Confirm catering numbers with supplier', 'todo', 'p2',
   '2026-06-11 17:00:00+01', owner_id, now(), now()),

  (t04, ws_id, ev_pulse, 'Badge printing & registration desk setup', 'todo', 'p2',
   '2026-06-14 09:00:00+01', owner_id, now(), now()),

  (t05, ws_id, ev_pulse, 'Run full AV tech rehearsal', 'todo', 'p1',
   '2026-06-14 18:00:00+01', owner_id, now(), now()),

  -- Theatre Gala Night tasks
  (t06, ws_id, ev_theatre, 'Send guest invitations for Theatre Gala', 'done', 'p2',
   '2026-06-04 17:00:00+01', owner_id, now(), now()),

  (t07, ws_id, ev_theatre, 'Confirm front-of-house staff', 'in_progress', 'p2',
   '2026-06-09 12:00:00+01', owner_id, now(), now()),

  -- After Dark tasks
  (t08, ws_id, ev_nightlife, 'DJ set order and lighting brief', 'done', 'p2',
   '2026-06-10 12:00:00+01', owner_id, now(), now()),

  (t09, ws_id, ev_nightlife, 'VIP guest list & wristbands', 'in_progress', 'p1',
   '2026-06-12 17:00:00+01', owner_id, now(), now()),

  -- Gala Dinner tasks
  (t10, ws_id, ev_gala, 'Table plan and floral centrepieces', 'todo', 'p1',
   '2026-06-20 17:00:00+01', owner_id, now(), now()),

  (t11, ws_id, ev_gala, 'Confirm charity auction items', 'todo', 'p2',
   '2026-06-22 12:00:00+01', owner_id, now(), now()),

  -- Food Festival tasks
  (t12, ws_id, ev_festival, 'Final stallholder briefing pack', 'todo', 'p2',
   '2026-06-23 17:00:00+01', owner_id, now(), now())

  ON CONFLICT (id) DO UPDATE SET
    title      = EXCLUDED.title,
    status     = EXCLUDED.status,
    priority   = EXCLUDED.priority,
    due_at     = EXCLUDED.due_at,
    updated_at = now();

  RAISE NOTICE 'Calendar June 2026 seed complete for workspace %', ws_id;
END $$;
