-- =============================================================================
-- Gala Dock — migrate legacy event_comms rows into the canonical
-- conversations/messages model, then retire event_comms as a data source.
-- (`communications` is not migrated here — it has 0 rows in production.)
--
-- One conversation is created per (event_id, recipient_type) group, since
-- event_comms had no conversation/thread concept of its own — every row was
-- a flat log entry. Each event_comms row becomes one message. Idempotent:
-- guarded by a marker on conversations.title + event_id so re-running this
-- migration does not duplicate conversations or messages.
--
-- Known fidelity limits carried over from the source data (documented in
-- release-evidence, not fixable by this migration):
--  - only a 200-char body_preview exists, never the full message body
--  - recipient contact has no email/user identity, only a name string
-- =============================================================================

DO $$
DECLARE
  rec RECORD;
  conv_id uuid;
  conv_type text;
  conv_title text;
  sender_kind text;
  fallback_user uuid;
  owner_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'event_comms') THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT ec.*, ev.name AS event_name
    FROM public.event_comms ec
    JOIN public.events ev ON ev.id = ec.event_id
    ORDER BY ec.event_id, ec.recipient_type, ec.created_at
  LOOP
    IF rec.created_by IS NULL THEN
      SELECT user_id INTO fallback_user FROM public.workspace_members WHERE workspace_id = rec.workspace_id ORDER BY created_at LIMIT 1;
      owner_id := fallback_user;
    ELSE
      owner_id := rec.created_by;
    END IF;
    conv_type := CASE
      WHEN rec.recipient_type = 'internal' THEN 'event_internal'
      WHEN rec.recipient_type = 'supplier' THEN 'event_supplier'
      ELSE 'event_client'
    END;
    -- Title omits the recipient_type suffix deliberately — the conversation
    -- badge (Client/Supplier/Internal) already conveys that, and repeating
    -- it in both the title and the badge read as redundant during visual QA.
    conv_title := coalesce(rec.event_name, 'Event');

    -- Dedup by (event_id, type) rather than title text: several recipient
    -- types can share the same event name once the redundant suffix is
    -- dropped from the title, and they must stay separate conversations.
    SELECT id INTO conv_id FROM public.conversations
    WHERE workspace_id = rec.workspace_id AND event_id = rec.event_id AND type = conv_type
    LIMIT 1;

    IF conv_id IS NULL THEN
      INSERT INTO public.conversations (workspace_id, type, title, visibility, event_id, external_org_name, created_by, last_message_at)
      VALUES (
        rec.workspace_id, conv_type, conv_title,
        CASE WHEN conv_type = 'event_internal' THEN 'internal' ELSE 'external' END,
        rec.event_id, rec.recipient_name, owner_id, rec.created_at
      )
      RETURNING id INTO conv_id;

      IF owner_id IS NOT NULL THEN
        INSERT INTO public.conversation_participants (workspace_id, conversation_id, user_id, participant_kind, role, added_by)
        VALUES (rec.workspace_id, conv_id, owner_id, 'internal', 'owner', owner_id)
        ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;
      END IF;

      IF conv_type <> 'event_internal' AND rec.recipient_name IS NOT NULL THEN
        INSERT INTO public.conversation_participants (workspace_id, conversation_id, user_id, external_contact_name, participant_kind, role, added_by)
        VALUES (rec.workspace_id, conv_id, NULL, rec.recipient_name, CASE WHEN conv_type = 'event_supplier' THEN 'supplier' ELSE 'client' END, 'member', owner_id);
      END IF;
    END IF;

    -- Skip if this exact event_comms row was already migrated (idempotency
    -- marker stored in message metadata via a matching created_at + body).
    IF NOT EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = conv_id AND m.created_at = rec.created_at AND m.body = coalesce(rec.body_preview, '(no content)')
    ) THEN
      sender_kind := CASE WHEN rec.direction = 'inbound' THEN
        (CASE WHEN conv_type = 'event_supplier' THEN 'supplier' WHEN conv_type = 'event_internal' THEN 'internal' ELSE 'client' END)
        ELSE 'internal' END;

      INSERT INTO public.messages (workspace_id, conversation_id, sender_user_id, sender_name, sender_type, body, created_at)
      VALUES (
        rec.workspace_id, conv_id,
        CASE WHEN sender_kind = 'internal' THEN owner_id ELSE NULL END,
        CASE WHEN sender_kind = 'internal' THEN 'You' ELSE coalesce(rec.recipient_name, 'Contact') END,
        sender_kind,
        coalesce(rec.body_preview, '(no content)'),
        rec.created_at
      );
    END IF;
  END LOOP;

  -- Keep last_message_at accurate after the bulk backfill above (the
  -- messages_touch_conversation trigger only fires on new inserts going
  -- forward, not on this one-time historical import loop's ordering).
  UPDATE public.conversations c SET last_message_at = m.max_created_at
  FROM (SELECT conversation_id, max(created_at) AS max_created_at FROM public.messages GROUP BY conversation_id) m
  WHERE c.id = m.conversation_id AND (c.last_message_at IS DISTINCT FROM m.max_created_at);
END $$;
