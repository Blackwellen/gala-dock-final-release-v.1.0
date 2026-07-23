-- =============================================================================
-- Gala Dock — Tasks Section Demo Seed
-- Powers all six Tasks screens: My Tasks, All Tasks, Event Tasks, Supplier
-- Tasks, Overdue, Templates.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING / WHERE NOT EXISTS guards.
-- Safe to re-run. Due dates are relative to now() so KPI counts (Due Today,
-- Overdue, Completed This Week, ...) are always computed live from real data,
-- never hardcoded.
-- ⚠️  Replace <WORKSPACE_ID> with a real workspace UUID before running.
-- ⚠️  ONLY run in dev/staging. Never overwrite production data.
-- =============================================================================

DO $$
DECLARE
  ws_id     uuid := '<WORKSPACE_ID>';   -- ← replace with real workspace UUID
  owner_id  uuid;
  list_id   uuid;

  -- Events resolved by name (created by demo-events-full-seed.sql /
  -- pulse-summit-2026-seed.sql). Falls back to NULL if not present — event
  -- tasks simply won't have a linked event in that case.
  ev_pulse    uuid;
  ev_theatre  uuid;
  ev_afterdark uuid;

  -- Fixed supplier UUIDs (idempotent; only inserted if a supplier with this
  -- name doesn't already exist under the workspace).
  sup_stagepro  uuid := 'c0510001-0000-0000-0000-000000000001';
  sup_eliteav   uuid := 'c0510001-0000-0000-0000-000000000002';
  sup_catering  uuid := 'c0510001-0000-0000-0000-000000000003';
  sup_gourmet   uuid := 'c0510001-0000-0000-0000-000000000004';
  sup_visionav  uuid := 'c0510001-0000-0000-0000-000000000005';
  sup_secure    uuid := 'c0510001-0000-0000-0000-000000000006';

  -- Assignee pool: real workspace members, cycled. Reference display names
  -- are only applied to members whose profile has no display_name yet, so
  -- we never overwrite a real user's chosen name.
  member_ids uuid[];
  member_names text[] := ARRAY[
    'Alex Morgan','Casey Nguyen','Taylor Kim','Morgan Riley','Jamie Taylor',
    'Sam Patel','Jordan Lee','Riley Chen','Avery Johnson'
  ];
  i int;

  -- Template ids
  tpl_conf     uuid := 'c0520001-0000-0000-0000-000000000001';
  tpl_wedding  uuid := 'c0520001-0000-0000-0000-000000000002';
  tpl_supplier uuid := 'c0520001-0000-0000-0000-000000000003';
  tpl_venue    uuid := 'c0520001-0000-0000-0000-000000000004';
  tpl_speaker  uuid := 'c0520001-0000-0000-0000-000000000005';
BEGIN
  SELECT user_id INTO owner_id FROM public.workspace_members WHERE workspace_id = ws_id LIMIT 1;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'No workspace_members found for workspace %; seed at least one member first.', ws_id;
  END IF;

  SELECT array_agg(user_id ORDER BY created_at) INTO member_ids
  FROM public.workspace_members WHERE workspace_id = ws_id;

  -- Backfill display names onto real members that don't have one yet, so the
  -- UI shows readable initials/avatars instead of "Unknown".
  FOR i IN 1 .. LEAST(array_length(member_ids, 1), array_length(member_names, 1)) LOOP
    UPDATE public.profiles
    SET display_name = member_names[i]
    WHERE user_id = member_ids[i] AND (display_name IS NULL OR display_name = '');
  END LOOP;

  SELECT id INTO ev_pulse    FROM public.events WHERE workspace_id = ws_id AND name = 'Pulse Summit & After Dark 2026' LIMIT 1;
  SELECT id INTO ev_theatre  FROM public.events WHERE workspace_id = ws_id AND name = 'Theatre Gala Night' LIMIT 1;
  SELECT id INTO ev_afterdark FROM public.events WHERE workspace_id = ws_id AND name = 'After Dark Club Night' LIMIT 1;

  -- Default workspace task list (tasks.list_id is NOT NULL)
  SELECT id INTO list_id FROM public.task_lists
    WHERE workspace_id = ws_id AND kind = 'workspace' AND archived_at IS NULL
    ORDER BY sort LIMIT 1;
  IF list_id IS NULL THEN
    INSERT INTO public.task_lists (workspace_id, created_by, kind, name)
    VALUES (ws_id, owner_id, 'workspace', 'General')
    RETURNING id INTO list_id;
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- SUPPLIERS (only created if missing under this workspace)
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.suppliers (id, workspace_id, name, status, tier)
  SELECT v.id, ws_id, v.name, 'active', v.tier
  FROM (VALUES
    (sup_stagepro, 'StagePro Lighting',     'preferred'),
    (sup_eliteav,  'Elite Audio Visual',    'preferred'),
    (sup_catering, 'Catering Collective',   'verified'),
    (sup_gourmet,  'Gourmet Events Co.',    'verified'),
    (sup_visionav, 'Vision AV',             'verified'),
    (sup_secure,   'SecureGuard Services',  'preferred')
  ) AS v(id, name, tier)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.workspace_id = ws_id AND s.name = v.name
  )
  ON CONFLICT (id) DO NOTHING;

  -- Re-resolve supplier ids by name in case they already existed with different ids.
  SELECT id INTO sup_stagepro FROM public.suppliers WHERE workspace_id = ws_id AND name = 'StagePro Lighting' LIMIT 1;
  SELECT id INTO sup_eliteav  FROM public.suppliers WHERE workspace_id = ws_id AND name = 'Elite Audio Visual' LIMIT 1;
  SELECT id INTO sup_catering FROM public.suppliers WHERE workspace_id = ws_id AND name = 'Catering Collective' LIMIT 1;
  SELECT id INTO sup_gourmet  FROM public.suppliers WHERE workspace_id = ws_id AND name = 'Gourmet Events Co.' LIMIT 1;
  SELECT id INTO sup_visionav FROM public.suppliers WHERE workspace_id = ws_id AND name = 'Vision AV' LIMIT 1;
  SELECT id INTO sup_secure   FROM public.suppliers WHERE workspace_id = ws_id AND name = 'SecureGuard Services' LIMIT 1;

  -- ───────────────────────────────────────────────────────────────────────
  -- EVENT TASKS  (fixed ids so re-runs update in place)
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.tasks (
    id, workspace_id, list_id, created_by, title, description, status, priority,
    due_at, event_id, category, phase, next_action, source
  ) VALUES
    ('d0530001-0000-0000-0000-000000000001', ws_id, list_id, owner_id,
     'Finalise AV setup and stage layout', 'Coordinate with AV team and venue on final stage plot.',
     'todo', 'p1', now() - interval '3 days', ev_pulse, 'production', 'Production', 'Confirm stage plot with AV lead', 'manual'),
    ('d0530001-0000-0000-0000-000000000002', ws_id, list_id, owner_id,
     'Confirm catering numbers with supplier', 'Final headcount and dietary needs.',
     'todo', 'p2', now() - interval '1 days', ev_pulse, 'logistics', 'Logistics', 'Reconfirm final numbers', 'manual'),
    ('d0530001-0000-0000-0000-000000000003', ws_id, list_id, owner_id,
     'Badge printing and registration desk setup', 'Print badges and stage the registration desk.',
     'todo', 'p3', now() + interval '3 days', ev_afterdark, 'operations', 'Operations', 'Order badge stock', 'manual'),
    ('d0530001-0000-0000-0000-000000000004', ws_id, list_id, owner_id,
     'Run full AV tech rehearsal', 'Full run-through with AV team and lighting cues.',
     'todo', 'p3', now() + interval '5 days', ev_theatre, 'production', 'Production', 'Book rehearsal slot', 'manual'),
    ('d0530001-0000-0000-0000-000000000005', ws_id, list_id, owner_id,
     'Confirm front-of-house staff', 'Lock in FOH team and confirm schedule.',
     'in_progress', 'p2', now() - interval '3 days', ev_theatre, 'operations', 'Operations', 'Send staff briefing pack', 'manual'),
    ('d0530001-0000-0000-0000-000000000006', ws_id, list_id, owner_id,
     'Send keynote speaker briefing packs', 'Email briefing packs to all confirmed speakers.',
     'in_progress', 'p1', now() - interval '2 days', ev_pulse, 'talent', 'Talent', 'Chase two outstanding replies', 'manual'),
    ('d0530001-0000-0000-0000-000000000007', ws_id, list_id, owner_id,
     'VIP guest list and wristbands', 'Prepare VIP list and order wristbands.',
     'in_progress', 'p3', now() - interval '1 days', ev_afterdark, 'access', 'Access', 'Send access team the list', 'manual'),
    ('d0530001-0000-0000-0000-000000000008', ws_id, list_id, owner_id,
     'Coordinate security briefing', 'Brief security team on site plan and VIP movements.',
     'in_progress', 'p3', now() - interval '1 days', ev_theatre, 'operations', 'Operations', 'Confirm briefing time with SecureGuard', 'manual'),
    ('d0530001-0000-0000-0000-000000000009', ws_id, list_id, owner_id,
     'Review lighting plot and cues', 'Approve final lighting design and cue sheet.',
     'review', 'p3', now() + interval '1 hours', ev_afterdark, 'production', 'Production', 'Approve cue list', 'manual'),
    ('d0530001-0000-0000-0000-000000000010', ws_id, list_id, owner_id,
     'Approve menu and dietary options', 'Review with catering partner and sign off.',
     'review', 'p4', now() + interval '3 days', ev_theatre, 'marketing', 'Marketing', 'Approve menu mockups', 'manual'),
    ('d0530001-0000-0000-0000-000000000011', ws_id, list_id, owner_id,
     'Check sponsor logo placements', 'Verify digital and printed sponsor logos.',
     'review', 'p3', now() + interval '1 days', ev_pulse, 'marketing', 'Marketing', 'Approve logo mockups', 'manual'),
    ('d0530001-0000-0000-0000-000000000012', ws_id, list_id, owner_id,
     'Send guest invitations for Theatre Gala', 'Email VIP list and track RSVPs.',
     'done', 'p2', now() - interval '10 days', ev_theatre, 'marketing', 'Marketing', 'Follow up with RSVP list', 'manual'),
    ('d0530001-0000-0000-0000-000000000013', ws_id, list_id, owner_id,
     'DJ set order and lighting brief', 'Align DJ set times and lighting brief with production.',
     'done', 'p1', now() - interval '9 days', ev_afterdark, 'talent', 'Talent', 'Confirm final set order', 'manual'),
    ('d0530001-0000-0000-0000-000000000014', ws_id, list_id, owner_id,
     'Create event run sheet v1', 'Draft timeline and key contacts for the run sheet.',
     'done', 'p3', now() - interval '8 days', ev_pulse, 'planning', 'Planning', 'Share run sheet with venue', 'manual'),
    ('d0530001-0000-0000-0000-000000000015', ws_id, list_id, owner_id,
     'Venue access schedule confirmed', 'Confirm load-in and load-out times with venue.',
     'done', 'p4', now() - interval '12 days', ev_pulse, 'logistics', 'Logistics', 'Share with venue ops', 'manual')
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, priority = EXCLUDED.priority, due_at = EXCLUDED.due_at,
    category = EXCLUDED.category, phase = EXCLUDED.phase, next_action = EXCLUDED.next_action;

  -- Milestone markers on the event timeline (used by "Upcoming Milestones")
  INSERT INTO public.tasks (
    id, workspace_id, list_id, created_by, title, description, status, priority,
    due_at, event_id, category, phase, is_milestone, milestone_label, source
  ) VALUES
    ('d0530001-0000-0000-0000-000000000016', ws_id, list_id, owner_id,
     'Stage & AV Rehearsal', 'Full production rehearsal milestone.', 'todo', 'p2',
     now() + interval '2 days', ev_pulse, 'production', 'Production', true, 'Stage & AV Rehearsal', 'manual'),
    ('d0530001-0000-0000-0000-000000000017', ws_id, list_id, owner_id,
     'Final Guest RSVP Cutoff', 'All RSVPs must be confirmed by this date.', 'todo', 'p2',
     now() + interval '4 days', ev_theatre, 'marketing', 'Marketing', true, 'Final Guest RSVP Cutoff', 'manual'),
    ('d0530001-0000-0000-0000-000000000018', ws_id, list_id, owner_id,
     'Event Day — Conference', 'Doors open, event begins.', 'todo', 'p1',
     now() + interval '7 days', ev_pulse, 'planning', 'Planning', true, 'Event Day — Conference', 'manual')
  ON CONFLICT (id) DO UPDATE SET due_at = EXCLUDED.due_at;

  -- ───────────────────────────────────────────────────────────────────────
  -- SUPPLIER TASKS
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.tasks (
    id, workspace_id, list_id, created_by, title, description, status, priority,
    due_at, event_id, supplier_id, category, next_action, source
  ) VALUES
    ('d0530001-0000-0000-0000-000000000021', ws_id, list_id, owner_id,
     'Submit Insurance Certificate', 'Upload COI and endorsements.', 'todo', 'p2',
     now() - interval '2 days', ev_pulse, sup_stagepro, 'compliance', 'Follow up', 'manual'),
    ('d0530001-0000-0000-0000-000000000022', ws_id, list_id, owner_id,
     'Complete W-9 Form', 'Provide updated tax information.', 'todo', 'p2',
     now() - interval '1 days', ev_theatre, sup_eliteav, 'onboarding', 'Resend email', 'manual'),
    ('d0530001-0000-0000-0000-000000000023', ws_id, list_id, owner_id,
     'Sign Vendor Agreement', 'Review and sign MSA.', 'in_progress', 'p3',
     now(), ev_afterdark, sup_catering, 'onboarding', 'Review agreement', 'manual'),
    ('d0530001-0000-0000-0000-000000000024', ws_id, list_id, owner_id,
     'Provide Menu & Pricing', 'Submit final menu and pricing.', 'in_progress', 'p3',
     now() + interval '1 days', ev_theatre, sup_gourmet, 'procurement', 'Check submission', 'manual'),
    ('d0530001-0000-0000-0000-000000000025', ws_id, list_id, owner_id,
     'Confirm Equipment List', 'Verify AV equipment and crew.', 'todo', 'p3',
     now() + interval '2 days', ev_pulse, sup_visionav, 'procurement', 'Request confirmation', 'manual'),
    ('d0530001-0000-0000-0000-000000000026', ws_id, list_id, owner_id,
     'Health & Safety Declaration', 'Complete H&S questionnaire.', 'todo', 'p4',
     now() + interval '4 days', ev_afterdark, sup_secure, 'compliance', 'Share H&S form', 'manual'),
    ('d0530001-0000-0000-0000-000000000027', ws_id, list_id, owner_id,
     'Subcontractor Disclosure', 'Provide list of subcontractors.', 'todo', 'p4',
     now() + interval '7 days', ev_theatre, sup_stagepro, 'compliance', 'Request disclosure', 'manual'),
    ('d0530001-0000-0000-0000-000000000028', ws_id, list_id, owner_id,
     'Final Invoice Submission', 'Submit final invoice.', 'todo', 'p3',
     now() + interval '10 days', ev_pulse, sup_eliteav, 'finance', 'Awaiting invoice', 'manual'),
    ('d0530001-0000-0000-0000-000000000029', ws_id, list_id, owner_id,
     'Post-Event Debrief', 'Complete post-event feedback.', 'todo', 'p4',
     now() + interval '12 days', ev_afterdark, sup_catering, 'follow-up', 'Schedule debrief', 'manual'),
    ('d0530001-0000-0000-0000-000000000030', ws_id, list_id, owner_id,
     'Update Food Safety Certificate', 'Provide current certification.', 'todo', 'p4',
     now() + interval '15 days', ev_pulse, sup_gourmet, 'compliance', 'Request certificate', 'manual'),
    ('d0530001-0000-0000-0000-000000000031', ws_id, list_id, owner_id,
     'Confirm delivery slot', 'Verify load-in delivery window.', 'done', 'p3',
     now() - interval '6 days', ev_pulse, sup_visionav, 'procurement', 'Delivery confirmed', 'manual'),
    ('d0530001-0000-0000-0000-000000000032', ws_id, list_id, owner_id,
     'Site risk assessment', 'Submit signed risk assessment.', 'done', 'p2',
     now() - interval '7 days', ev_theatre, sup_secure, 'compliance', 'Assessment received', 'manual')
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, due_at = EXCLUDED.due_at, next_action = EXCLUDED.next_action;

  -- ───────────────────────────────────────────────────────────────────────
  -- ASSIGNEES (cycle through real workspace members)
  -- ───────────────────────────────────────────────────────────────────────
  IF array_length(member_ids, 1) > 0 THEN
    FOR i IN 1 .. 32 LOOP
      INSERT INTO public.task_assignees (task_id, user_id, assigned_by)
      SELECT t.id, member_ids[((i - 1) % array_length(member_ids, 1)) + 1], owner_id
      FROM public.tasks t
      WHERE t.workspace_id = ws_id
        AND t.id = ('d0530001-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- CHECKLIST ITEMS (a couple of representative tasks)
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.task_checklist_items (workspace_id, task_id, title, is_done, sort, created_by)
  SELECT ws_id, 'd0530001-0000-0000-0000-000000000001'::uuid, v.title, v.is_done, v.sort, owner_id
  FROM (VALUES
    ('Confirm stage dimensions with venue', true, 1),
    ('Book AV crew call sheet', true, 2),
    ('Finalise lighting plot with production', false, 3),
    ('Sign off stage layout with client', false, 4)
  ) AS v(title, is_done, sort)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_checklist_items c
    WHERE c.task_id = 'd0530001-0000-0000-0000-000000000001'::uuid AND c.title = v.title
  );

  -- ───────────────────────────────────────────────────────────────────────
  -- DEPENDENCIES (rehearsal milestone blocked by AV setup)
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.task_dependencies (task_id, depends_on_task_id, kind, created_by)
  VALUES (
    'd0530001-0000-0000-0000-000000000016'::uuid,
    'd0530001-0000-0000-0000-000000000001'::uuid,
    'blocks',
    owner_id
  )
  ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;

  -- ───────────────────────────────────────────────────────────────────────
  -- STATUS HISTORY (drives Resolution Rate on the Overdue screen)
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.task_status_history (workspace_id, task_id, from_status, to_status, was_overdue, changed_by, changed_at)
  SELECT ws_id, id, 'todo', 'done', (random() < 0.24), owner_id, completed_at
  FROM public.tasks
  WHERE workspace_id = ws_id AND status = 'done' AND completed_at IS NOT NULL
    AND id::text LIKE 'd0530001-%'
  ON CONFLICT DO NOTHING;

  -- ───────────────────────────────────────────────────────────────────────
  -- TASK TEMPLATES + ITEMS
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.task_templates (id, workspace_id, created_by, name, description, category, use_case, icon, is_active, automation_ready)
  VALUES
    (tpl_conf, ws_id, owner_id, 'Corporate Conference Launch',
     'End-to-end task list for launching a corporate conference from planning to execution.',
     'Corporate Events', 'Conference', 'Briefcase', true, true),
    (tpl_wedding, ws_id, owner_id, 'Wedding Operations Checklist',
     'Comprehensive checklist for managing wedding day operations and vendor coordination.',
     'Weddings', 'Wedding', 'Heart', true, true),
    (tpl_supplier, ws_id, owner_id, 'Supplier Onboarding Follow-up',
     'Standard follow-up tasks for onboarding and aligning new suppliers.',
     'Supplier Mgmt', 'Onboarding', 'Users', true, true),
    (tpl_venue, ws_id, owner_id, 'Venue Walkthrough Prep',
     'Tasks to prepare for and follow up on venue walkthroughs and site visits.',
     'Venue Mgmt', 'Site Visit', 'MapPin', true, false),
    (tpl_speaker, ws_id, owner_id, 'Speaker Briefing Workflow',
     'Checklist for briefing speakers and managing content, timings, and requirements.',
     'Conference', 'Talent', 'Mic', true, false)
  ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description, category = EXCLUDED.category, use_case = EXCLUDED.use_case,
    icon = EXCLUDED.icon, is_active = EXCLUDED.is_active, automation_ready = EXCLUDED.automation_ready;

  INSERT INTO public.task_template_items (template_id, title, description, list_name, priority, offset_days, category)
  SELECT tpl_conf, v.title, v.title, 'Conference', v.priority::task_priority, v.offset_days, v.category
  FROM (VALUES
    ('Confirm venue contract', 'p1', -60, 'Planning'),
    ('Book keynote speakers', 'p1', -45, 'Talent'),
    ('Open registration', 'p2', -30, 'Marketing'),
    ('Confirm AV production plan', 'p2', -14, 'Production'),
    ('Print badges and signage', 'p3', -3, 'Operations'),
    ('Run final tech rehearsal', 'p2', -1, 'Production')
  ) AS v(title, priority, offset_days, category)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_template_items it WHERE it.template_id = tpl_conf AND it.title = v.title
  );

  INSERT INTO public.task_template_items (template_id, title, description, list_name, priority, offset_days, category)
  SELECT tpl_wedding, v.title, v.title, 'Wedding', v.priority::task_priority, v.offset_days, v.category
  FROM (VALUES
    ('Confirm final guest count', 'p2', -14, 'Planning'),
    ('Approve menu and dietary options', 'p3', -10, 'Catering'),
    ('Confirm florist delivery window', 'p3', -2, 'Logistics'),
    ('Brief officiant and bridal party', 'p2', -1, 'Talent')
  ) AS v(title, priority, offset_days, category)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_template_items it WHERE it.template_id = tpl_wedding AND it.title = v.title
  );

  INSERT INTO public.task_template_items (template_id, title, description, list_name, priority, offset_days, category)
  SELECT tpl_supplier, v.title, v.title, 'Supplier Onboarding', v.priority::task_priority, v.offset_days, v.category
  FROM (VALUES
    ('Submit Insurance Certificate', 'p2', 3, 'Compliance'),
    ('Sign Vendor Agreement', 'p2', 5, 'Onboarding'),
    ('Complete W-9 / tax form', 'p3', 5, 'Onboarding'),
    ('Confirm bank details for payment', 'p3', 7, 'Finance')
  ) AS v(title, priority, offset_days, category)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_template_items it WHERE it.template_id = tpl_supplier AND it.title = v.title
  );

  INSERT INTO public.task_template_items (template_id, title, description, list_name, priority, offset_days, category)
  SELECT tpl_venue, v.title, v.title, 'Venue Mgmt', v.priority::task_priority, v.offset_days, v.category
  FROM (VALUES
    ('Schedule walkthrough date', 'p3', -21, 'Planning'),
    ('Prepare site visit checklist', 'p4', -14, 'Planning'),
    ('Capture photos and floor notes', 'p4', 0, 'Production'),
    ('Send walkthrough follow-up notes', 'p4', 1, 'Follow-up')
  ) AS v(title, priority, offset_days, category)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_template_items it WHERE it.template_id = tpl_venue AND it.title = v.title
  );

  INSERT INTO public.task_template_items (template_id, title, description, list_name, priority, offset_days, category)
  SELECT tpl_speaker, v.title, v.title, 'Speaker Briefing', v.priority::task_priority, v.offset_days, v.category
  FROM (VALUES
    ('Send briefing pack to speakers', 'p2', -21, 'Talent'),
    ('Confirm AV requirements per speaker', 'p3', -10, 'Production'),
    ('Schedule tech check per speaker', 'p3', -3, 'Production'),
    ('Collect final slide decks', 'p2', -2, 'Talent')
  ) AS v(title, priority, offset_days, category)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_template_items it WHERE it.template_id = tpl_speaker AND it.title = v.title
  );

  -- Template usage history (drives Template Usage donut + Most Popular Categories)
  INSERT INTO public.task_template_usage (workspace_id, template_id, action, actor_id, tasks_created, created_at)
  SELECT ws_id, tpl, act, owner_id, cnt, now() - (n || ' days')::interval
  FROM (
    SELECT tpl_conf AS tpl, 'applied' AS act, 6 AS cnt, gs AS n FROM generate_series(1, 124) gs
    UNION ALL SELECT tpl_conf, 'duplicated', 6, gs + 5 FROM generate_series(1, 18) gs
    UNION ALL SELECT tpl_wedding, 'applied', 4, gs FROM generate_series(1, 89) gs
    UNION ALL SELECT tpl_supplier, 'applied', 4, gs FROM generate_series(1, 67) gs
    UNION ALL SELECT tpl_venue, 'applied', 4, gs FROM generate_series(1, 54) gs
    UNION ALL SELECT tpl_speaker, 'applied', 4, gs FROM generate_series(1, 41) gs
    UNION ALL SELECT tpl_conf, 'edited', 6, gs + 2 FROM generate_series(1, 45) gs
  ) x(tpl, act, cnt, n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.task_template_usage u
    WHERE u.template_id = x.tpl AND u.action = x.act AND u.created_at = now() - (x.n || ' days')::interval
  );

END $$;
