-- =============================================================================
-- Gala Dock — Inbox / Messaging Section Demo Seed
-- Powers all 9 Inbox reference screens: All, Unread, Conversations, Internal,
-- full direct chat, full group chat, and the 3 Gala Copilot Inbox panel states.
-- Idempotent: fixed UUIDs + WHERE NOT EXISTS guards. Safe to re-run.
-- Only real workspace_members are used as message senders (sender_user_id
-- must reference a real auth.users row) — external client/supplier "senders"
-- are stored as name snapshots with sender_user_id = NULL, since this repo
-- has no client/supplier portal identity table yet.
-- ⚠️  Replace <WORKSPACE_ID> with a real workspace UUID before running.
-- ⚠️  ONLY run in dev/staging. Never overwrite production data.
-- =============================================================================

DO $$
DECLARE
  ws_id uuid := '<WORKSPACE_ID>';   -- ← replace with real workspace UUID
  me    uuid;                       -- current/owner user, plays "You" (JT)

  member_ids   uuid[];
  member_names text[] := ARRAY['Alex Lee','Emma Wilson','Kevin Brooks','Lena Harris','Maya Patel','Jordan Kim','Taylor Morgan','James Brown'];
  n_members    int;

  -- resolved per-slot member id (falls back to `me` if the workspace has fewer real members)
  u_alex uuid; u_emma uuid; u_kevin uuid; u_lena uuid; u_maya uuid; u_jordan uuid; u_taylor uuid; u_james uuid;

  ev_gala uuid; -- optional link to a demo event if one exists

  -- Fixed conversation UUIDs
  c_sarah    uuid := 'c0530001-0000-0000-0000-000000000001'; -- Sarah Chandler / Skyline Events (client_direct)
  c_ridge    uuid := 'c0530001-0000-0000-0000-000000000002'; -- North Ridge Production invoice (supplier_direct)
  c_james    uuid := 'c0530001-0000-0000-0000-000000000003'; -- James Brown (direct_internal)
  c_ritz     uuid := 'c0530001-0000-0000-0000-000000000004'; -- The Ritz London (client_direct)
  c_peak     uuid := 'c0530001-0000-0000-0000-000000000005'; -- Peak Works (supplier_direct)
  c_alex     uuid := 'c0530001-0000-0000-0000-000000000006'; -- Alex Lee (direct_internal)
  c_planning uuid := 'c0530001-0000-0000-0000-000000000007'; -- Production Planning – Gala 2025 (group_internal)
  c_summer   uuid := 'c0530001-0000-0000-0000-000000000008'; -- Summer Gala Production Team (group_internal)
  c_stageav  uuid := 'c0530001-0000-0000-0000-000000000009'; -- Stage & AV Alignment
  c_vendor   uuid := 'c0530001-0000-0000-0000-00000000000a'; -- Vendor Load-In Coordination
  c_catering uuid := 'c0530001-0000-0000-0000-00000000000b'; -- Catering & Hospitality Update
  c_marketing uuid := 'c0530001-0000-0000-0000-00000000000c'; -- Marketing & Comms Sync
  c_volunteer uuid := 'c0530001-0000-0000-0000-00000000000d'; -- Volunteer Briefing Notes

  m_id uuid; -- scratch message id
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = ws_id) THEN
    RAISE EXCEPTION 'Workspace % not found — replace <WORKSPACE_ID> with a real workspace UUID.', ws_id;
  END IF;

  SELECT user_id INTO me FROM public.workspace_members WHERE workspace_id = ws_id ORDER BY created_at LIMIT 1;
  IF me IS NULL THEN RAISE EXCEPTION 'No workspace_members found for workspace %.', ws_id; END IF;

  SELECT array_agg(user_id ORDER BY created_at) INTO member_ids FROM public.workspace_members WHERE workspace_id = ws_id;
  n_members := array_length(member_ids, 1);

  -- Backfill display names on real members that don't have one yet.
  FOR i IN 1 .. LEAST(n_members, array_length(member_names, 1)) LOOP
    UPDATE public.profiles SET display_name = member_names[i]
    WHERE user_id = member_ids[i] AND (display_name IS NULL OR display_name = '');
  END LOOP;

  -- Cycle real members into named slots (falls back to `me` if workspace has only 1 member).
  u_alex   := member_ids[((0) % n_members) + 1];
  u_emma   := member_ids[((1) % n_members) + 1];
  u_kevin  := member_ids[((2) % n_members) + 1];
  u_lena   := member_ids[((3) % n_members) + 1];
  u_maya   := member_ids[((4) % n_members) + 1];
  u_jordan := member_ids[((5) % n_members) + 1];
  u_taylor := member_ids[((6) % n_members) + 1];
  u_james  := member_ids[((7) % n_members) + 1];

  SELECT id INTO ev_gala FROM public.events WHERE workspace_id = ws_id ORDER BY created_at LIMIT 1;

  -- ==========================================================================
  -- CONVERSATIONS
  -- ==========================================================================
  INSERT INTO public.conversations (id, workspace_id, type, title, visibility, external_org_name, event_id, created_by, last_message_at)
  VALUES
    (c_sarah, ws_id, 'client_direct', 'Production schedule & load-in update', 'external', 'Skyline Events Inc.', ev_gala, me, now() - interval '35 minutes'),
    (c_ridge, ws_id, 'supplier_direct', 'Invoice #INV-4521', 'external', 'North Ridge Production', ev_gala, me, now() - interval '3 hours'),
    (c_james, ws_id, 'direct_internal', 'Event run-of-show draft', 'internal', NULL, ev_gala, me, now() - interval '2 days'),
    (c_ritz, ws_id, 'client_direct', 'Catering headcount confirmation', 'external', 'The Ritz London', ev_gala, me, now() - interval '1 day'),
    (c_peak, ws_id, 'supplier_direct', 'Lighting equipment availability', 'external', 'Peak Works', ev_gala, me, now() - interval '2 days'),
    (c_alex, ws_id, 'direct_internal', 'Stage plot revisions', 'internal', NULL, ev_gala, me, now() - interval '1 day'),
    (c_planning, ws_id, 'group_internal', 'Production Planning – Gala 2025', 'internal', NULL, ev_gala, me, now() - interval '40 minutes'),
    (c_summer, ws_id, 'group_internal', 'Summer Gala Production Team', 'internal', NULL, ev_gala, me, now() - interval '25 minutes'),
    (c_stageav, ws_id, 'group_internal', 'Stage & AV Alignment', 'internal', NULL, ev_gala, me, now() - interval '5 hours'),
    (c_vendor, ws_id, 'group_internal', 'Vendor Load-In Coordination', 'internal', NULL, ev_gala, me, now() - interval '6 hours'),
    (c_catering, ws_id, 'group_internal', 'Catering & Hospitality Update', 'internal', NULL, ev_gala, me, now() - interval '1 day'),
    (c_marketing, ws_id, 'group_internal', 'Marketing & Comms Sync', 'internal', NULL, ev_gala, me, now() - interval '1 day'),
    (c_volunteer, ws_id, 'group_internal', 'Volunteer Briefing Notes', 'internal', NULL, ev_gala, me, now() - interval '3 days')
  ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- PARTICIPANTS
  -- ==========================================================================
  INSERT INTO public.conversation_participants (workspace_id, conversation_id, user_id, external_contact_name, participant_kind, role, added_by, last_read_at)
  VALUES
    -- Sarah Chandler direct
    (ws_id, c_sarah, me, NULL, 'internal', 'owner', me, now() - interval '11 minutes'),
    (ws_id, c_sarah, NULL, 'Sarah Chandler', 'client', 'member', me, NULL),
    -- North Ridge invoice
    (ws_id, c_ridge, me, NULL, 'internal', 'owner', me, NULL),
    (ws_id, c_ridge, NULL, 'North Ridge Production', 'supplier', 'member', me, NULL),
    -- James Brown internal
    (ws_id, c_james, me, NULL, 'internal', 'owner', me, now() - interval '2 days'),
    (ws_id, c_james, u_james, NULL, 'internal', 'member', me, now() - interval '2 days'),
    -- Ritz London
    (ws_id, c_ritz, me, NULL, 'internal', 'owner', me, now() - interval '1 day'),
    (ws_id, c_ritz, NULL, 'The Ritz London', 'client', 'member', me, NULL),
    -- Peak Works
    (ws_id, c_peak, me, NULL, 'internal', 'owner', me, now() - interval '2 days'),
    (ws_id, c_peak, NULL, 'Peak Works', 'supplier', 'member', me, NULL),
    -- Alex Lee internal
    (ws_id, c_alex, me, NULL, 'internal', 'owner', me, NULL),
    (ws_id, c_alex, u_alex, NULL, 'internal', 'member', me, now() - interval '1 day'),
    -- Production Planning group
    (ws_id, c_planning, me, NULL, 'internal', 'owner', me, now() - interval '35 minutes'),
    (ws_id, c_planning, u_james, NULL, 'internal', 'admin', me, now() - interval '9 hours'),
    (ws_id, c_planning, u_emma, NULL, 'internal', 'member', me, now() - interval '9 hours'),
    (ws_id, c_planning, u_kevin, NULL, 'internal', 'member', me, now() - interval '9 hours'),
    (ws_id, c_planning, u_lena, NULL, 'internal', 'member', me, now() - interval '9 hours'),
    (ws_id, c_planning, u_maya, NULL, 'internal', 'member', me, now() - interval '9 hours'),
    -- Summer Gala group
    (ws_id, c_summer, me, NULL, 'internal', 'owner', me, now() - interval '20 minutes'),
    (ws_id, c_summer, u_alex, NULL, 'internal', 'admin', me, now() - interval '30 minutes'),
    (ws_id, c_summer, u_maya, NULL, 'internal', 'member', me, now() - interval '30 minutes'),
    (ws_id, c_summer, u_jordan, NULL, 'internal', 'member', me, now() - interval '30 minutes'),
    (ws_id, c_summer, u_taylor, NULL, 'internal', 'member', me, now() - interval '30 minutes'),
    (ws_id, c_summer, u_emma, NULL, 'internal', 'member', me, now() - interval '30 minutes'),
    (ws_id, c_summer, u_kevin, NULL, 'internal', 'member', me, now() - interval '30 minutes'),
    -- Stage & AV
    (ws_id, c_stageav, me, NULL, 'internal', 'owner', me, now() - interval '5 hours'),
    (ws_id, c_stageav, u_emma, NULL, 'internal', 'member', me, now() - interval '5 hours'),
    -- Vendor load-in
    (ws_id, c_vendor, me, NULL, 'internal', 'owner', me, now() - interval '6 hours'),
    (ws_id, c_vendor, u_kevin, NULL, 'internal', 'member', me, now() - interval '6 hours'),
    -- Catering
    (ws_id, c_catering, me, NULL, 'internal', 'owner', me, now() - interval '1 day'),
    (ws_id, c_catering, u_lena, NULL, 'internal', 'member', me, now() - interval '1 day'),
    -- Marketing
    (ws_id, c_marketing, me, NULL, 'internal', 'owner', me, now() - interval '1 day'),
    (ws_id, c_marketing, u_maya, NULL, 'internal', 'member', me, now() - interval '1 day'),
    -- Volunteer
    (ws_id, c_volunteer, me, NULL, 'internal', 'owner', me, now() - interval '3 days'),
    (ws_id, c_volunteer, u_jordan, NULL, 'internal', 'member', me, now() - interval '3 days')
  ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;

  -- Insert external (no user_id) participants separately since the partial unique
  -- index above only applies to non-null user_id rows and a second run would
  -- otherwise duplicate them.
  INSERT INTO public.conversation_participants (workspace_id, conversation_id, user_id, external_contact_name, participant_kind, role, added_by)
  SELECT ws_id, c_sarah, NULL, 'Sarah Chandler', 'client', 'member', me
  WHERE NOT EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = c_sarah AND external_contact_name = 'Sarah Chandler');

  INSERT INTO public.conversation_participants (workspace_id, conversation_id, user_id, external_contact_name, participant_kind, role, added_by)
  SELECT ws_id, c_ridge, NULL, 'North Ridge Production', 'supplier', 'member', me
  WHERE NOT EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = c_ridge AND external_contact_name = 'North Ridge Production');

  INSERT INTO public.conversation_participants (workspace_id, conversation_id, user_id, external_contact_name, participant_kind, role, added_by)
  SELECT ws_id, c_ritz, NULL, 'The Ritz London', 'client', 'member', me
  WHERE NOT EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = c_ritz AND external_contact_name = 'The Ritz London');

  INSERT INTO public.conversation_participants (workspace_id, conversation_id, user_id, external_contact_name, participant_kind, role, added_by)
  SELECT ws_id, c_peak, NULL, 'Peak Works', 'supplier', 'member', me
  WHERE NOT EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = c_peak AND external_contact_name = 'Peak Works');

  -- ==========================================================================
  -- MESSAGES
  -- ==========================================================================

  -- Sarah Chandler thread (unread=0 for `me`, since last_read_at above is after these)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_sarah) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_sarah, NULL, 'Sarah Chandler', 'client', 'Hi team, could you please share the updated production schedule including load-in, tech rehearsal, and show days?', now() - interval '25 minutes'),
      (ws_id, c_sarah, me, 'You', 'internal', 'Hi Sarah, absolutely! Please find the latest schedule attached. All timings are confirmed with the venue.', now() - interval '20 minutes'),
      (ws_id, c_sarah, NULL, 'Sarah Chandler', 'client', 'Thanks! This looks great. We''ll share it with the rest of the team and come back if we have any questions.', now() - interval '11 minutes');

    UPDATE public.conversations SET last_message_at = now() - interval '11 minutes' WHERE id = c_sarah;

    SELECT id INTO m_id FROM public.messages WHERE conversation_id = c_sarah ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.message_reactions (workspace_id, message_id, user_id, emoji)
    VALUES (ws_id, m_id, me, '👍') ON CONFLICT DO NOTHING;
  END IF;

  -- North Ridge invoice thread (unread — participant last_read_at is NULL)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_ridge) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_ridge, NULL, 'North Ridge Production', 'supplier', 'Hi team, please find attached invoice #INV-4521 for the production services provided for the Summer Gala on May 18, 2025. Let us know if you need any additional information. Thanks!', now() - interval '3 hours 5 minutes'),
      (ws_id, c_ridge, NULL, 'North Ridge Production', 'supplier', 'Also, just a heads-up — payment terms are NET 30. Please confirm receipt.', now() - interval '3 hours 2 minutes'),
      (ws_id, c_ridge, NULL, 'North Ridge Production', 'supplier', 'Happy to jump on a quick call if you''d like to go over anything. Thanks!', now() - interval '3 hours');
  END IF;

  -- James Brown internal (read)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_james) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_james, u_james, 'James Brown', 'internal', 'Shared the latest run-of-show for review.', now() - interval '2 days');
  END IF;

  -- Ritz London (read)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_ritz) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_ritz, NULL, 'The Ritz London', 'client', 'Please see attached parking instructions.', now() - interval '1 day 1 hour'),
      (ws_id, c_ritz, NULL, 'The Ritz London', 'client', 'Headcount confirmed for 320 guests.', now() - interval '1 day');
  END IF;

  -- Peak Works (read)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_peak) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_peak, NULL, 'Peak Works', 'supplier', 'Moving heads are available as requested.', now() - interval '2 days');
  END IF;

  -- Alex Lee internal (unread=1)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_alex) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_alex, u_alex, 'Alex Lee', 'internal', 'Let''s align on the latest revisions before we lock the stage plot.', now() - interval '1 day');
  END IF;

  -- Production Planning group (with pinned attachment)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_planning) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_planning, me, 'You', 'internal', 'Team, please review the run-of-show draft v3 for Gala 2025. We''ve updated the stage timings and added the VIP walkthrough. Feedback by EOD tomorrow so we can lock by Friday.', now() - interval '9 hours'),
      (ws_id, c_planning, u_emma, 'Emma Wilson', 'internal', 'Looks good overall. I''ll confirm LED wall content timings with the AV team and flag any adjustments.', now() - interval '8 hours 54 minutes'),
      (ws_id, c_planning, u_kevin, 'Kevin Brooks', 'internal', 'Load-in plan confirmed with vendors. All trucks scheduled between 7–11 AM on event day. Dock access and lift bookings are set.', now() - interval '8 hours 40 minutes'),
      (ws_id, c_planning, u_lena, 'Lena Harris', 'internal', 'Hospitality team is aligned. Final menu locked and staff confirmations in. I''ll share the floor plan shortly.', now() - interval '8 hours 24 minutes');

    SELECT id INTO m_id FROM public.messages WHERE conversation_id = c_planning ORDER BY created_at ASC LIMIT 1;
    UPDATE public.messages SET pinned_at = now() - interval '8 hours 55 minutes', pinned_by = me WHERE id = m_id;
    INSERT INTO public.message_attachments (workspace_id, conversation_id, message_id, uploaded_by, original_file_name, mime_type, size_bytes, r2_key)
    VALUES (ws_id, c_planning, m_id, me, 'Gala 2025 – Run Sheet v3.pdf', 'application/pdf', 1258291, ws_id || '/message-attachment/' || c_planning || '/demo-run-sheet-v3.pdf');

    SELECT id INTO m_id FROM public.messages WHERE conversation_id = c_planning ORDER BY created_at ASC LIMIT 1;
    INSERT INTO public.message_reactions (workspace_id, message_id, user_id, emoji) VALUES (ws_id, m_id, u_emma, '👍'), (ws_id, m_id, u_kevin, '👍') ON CONFLICT DO NOTHING;
  END IF;

  -- Summer Gala Production Team (with checklist-style message + attachment)
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_summer) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at) VALUES
      (ws_id, c_summer, u_alex, 'Alex Lee', 'internal', 'Good morning team! Here''s the latest run of show for Saturday. Please review the timing for the awards segment and let me know if you see any conflicts.', now() - interval '30 minutes'),
      (ws_id, c_summer, u_maya, 'Maya Patel', 'internal', 'Looks good overall. I have a note on the stage reset after awards. Will share feedback inline.', now() - interval '28 minutes'),
      (ws_id, c_summer, u_jordan, 'Jordan Kim', 'internal', 'Audio team is good with the timing. We''ll need a 5-min heads up before the live performance for mic check.', now() - interval '26 minutes'),
      (ws_id, c_summer, u_taylor, 'Taylor Morgan', 'internal', 'Catering confirmed the plated dinner will be served by 8:15 PM. All set from our side.', now() - interval '23 minutes'),
      (ws_id, c_summer, u_alex, 'Alex Lee', 'internal', 'Run of Show — Pre-Event Checklist', now() - interval '20 minutes'),
      (ws_id, c_summer, me, 'You', 'internal', 'Thanks everyone! Let''s lock this in by EOD. Great work team.', now() - interval '20 minutes');

    SELECT id INTO m_id FROM public.messages WHERE conversation_id = c_summer ORDER BY created_at ASC LIMIT 1;
    INSERT INTO public.message_attachments (workspace_id, conversation_id, message_id, uploaded_by, original_file_name, mime_type, size_bytes, r2_key)
    VALUES (ws_id, c_summer, m_id, u_alex, 'Run_of_Show_v5.pdf', 'application/pdf', 1258291, ws_id || '/message-attachment/' || c_summer || '/demo-run-of-show-v5.pdf');
    INSERT INTO public.message_reactions (workspace_id, message_id, user_id, emoji) VALUES (ws_id, m_id, u_maya, '👍') ON CONFLICT DO NOTHING;

    SELECT id INTO m_id FROM public.messages WHERE conversation_id = c_summer AND sender_user_id = u_jordan LIMIT 1;
    INSERT INTO public.message_reactions (workspace_id, message_id, user_id, emoji) VALUES (ws_id, m_id, u_taylor, '👍') ON CONFLICT DO NOTHING;
  END IF;

  -- Remaining internal groups: single opening message each
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_stageav) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at)
    VALUES (ws_id, c_stageav, u_emma, 'Emma Wilson', 'internal', 'LED wall content timings and audio checks.', now() - interval '5 hours');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_vendor) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at)
    VALUES (ws_id, c_vendor, u_kevin, 'Kevin Brooks', 'internal', 'Dock access, lift bookings, and parking.', now() - interval '6 hours');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_catering) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at)
    VALUES (ws_id, c_catering, u_lena, 'Lena Harris', 'internal', 'Menu finalisation and staffing confirmations.', now() - interval '1 day');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_marketing) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at)
    VALUES (ws_id, c_marketing, u_maya, 'Maya Patel', 'internal', 'Event comms plan and social schedule.', now() - interval '1 day');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = c_volunteer) THEN
    INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at)
    VALUES (ws_id, c_volunteer, u_jordan, 'Jordan Kim', 'internal', 'Roles, timings, and check-in process.', now() - interval '3 days');
  END IF;

  RAISE NOTICE 'Inbox demo seed complete for workspace %.', ws_id;
END $$;
