-- =============================================================================
-- Gala Dock — Canonical Inbox Messaging Engine
-- Replaces the log-only `communications` / `event_comms` split with one
-- canonical conversations/messages model shared by:
--   - the full-page Inbox (/event-manager/inbox)
--   - the Gala Copilot panel's Inbox tab
--   - the Event Profile Comms tab (filtered by event_id)
-- Idempotent: CREATE TABLE IF NOT EXISTS / DO $$ ... IF NOT EXISTS guards.
-- RLS: workspace membership (is_workspace_member) + conversation participation.
--
-- NOTE ON EXTERNAL PORTAL USERS: this repo has no client/supplier portal
-- identity table yet (no client_users/supplier_users, confirmed absent from
-- migrations and generated types). External participants are therefore
-- stored as name/email snapshots on conversation_participants rather than
-- as auth.users rows. Until a portal-auth identity table exists, external
-- users cannot log in and authenticate against these RLS policies directly —
-- this is flagged as a manual follow-up in the release-evidence docs.
-- =============================================================================

-- ─── CONVERSATIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type              text NOT NULL DEFAULT 'direct_internal'
    CHECK (type IN (
      'direct_internal','group_internal','client_direct','client_group',
      'supplier_direct','supplier_group','mixed_external',
      'event_internal','event_client','event_supplier','internal_note_thread'
    )),
  title             text,
  visibility        text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','external')),
  event_id          uuid REFERENCES public.events(id) ON DELETE SET NULL,
  lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id       uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  rfq_id            uuid REFERENCES public.rfqs(id) ON DELETE SET NULL,
  supplier_id       uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  venue_id          uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  invoice_id        uuid REFERENCES public.event_invoices(id) ON DELETE SET NULL,
  task_id           uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  external_org_name text,                      -- snapshot label e.g. "Skyline Events Inc."
  created_by        uuid REFERENCES auth.users(id),
  last_message_at   timestamptz,
  archived_at       timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_workspace_idx     ON public.conversations (workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_event_idx         ON public.conversations (workspace_id, event_id);
CREATE INDEX IF NOT EXISTS conversations_supplier_idx      ON public.conversations (workspace_id, supplier_id);
CREATE INDEX IF NOT EXISTS conversations_lead_idx          ON public.conversations (workspace_id, lead_id);
CREATE INDEX IF NOT EXISTS conversations_type_idx          ON public.conversations (workspace_id, type);

-- ─── CONVERSATION PARTICIPANTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id       uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id               uuid REFERENCES auth.users(id),          -- internal staff
  external_contact_name text,                                    -- snapshot for external participants
  external_contact_email text,
  participant_kind      text NOT NULL DEFAULT 'internal'
    CHECK (participant_kind IN ('internal','client','supplier','guest')),
  role                  text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','guest')),
  can_post              boolean NOT NULL DEFAULT true,
  last_read_message_id  uuid,
  last_read_at          timestamptz,
  muted_until           timestamptz,
  pinned_at             timestamptz,
  archived_at           timestamptz,
  added_by              uuid REFERENCES auth.users(id),
  joined_at             timestamptz NOT NULL DEFAULT now(),
  left_at               timestamptz,
  removed_at            timestamptz,
  CONSTRAINT conversation_participants_identity_chk
    CHECK (user_id IS NOT NULL OR external_contact_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS conversation_participants_conv_idx ON public.conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx ON public.conversation_participants (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_participants_unique_user
  ON public.conversation_participants (conversation_id, user_id) WHERE user_id IS NOT NULL;

-- ─── MESSAGES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id     uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_user_id      uuid REFERENCES auth.users(id),
  sender_name         text,                     -- snapshot; required when sender_user_id is null (external/system)
  sender_type         text NOT NULL DEFAULT 'internal' CHECK (sender_type IN ('internal','client','supplier','system')),
  reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  body                text NOT NULL,
  body_format         text NOT NULL DEFAULT 'plain' CHECK (body_format IN ('plain','markdown')),
  visibility          text NOT NULL DEFAULT 'standard' CHECK (visibility IN ('standard','internal_note')),
  status              text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','edited','withdrawn')),
  pinned_at           timestamptz,
  pinned_by           uuid REFERENCES auth.users(id),
  edited_at           timestamptz,
  withdrawn_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_workspace_idx    ON public.messages (workspace_id);
CREATE INDEX IF NOT EXISTS messages_sender_idx       ON public.messages (sender_user_id) WHERE sender_user_id IS NOT NULL;

-- ─── MESSAGE ATTACHMENTS (R2-backed) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id   uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id        uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  uploaded_by       uuid REFERENCES auth.users(id),
  original_file_name text NOT NULL,
  mime_type         text NOT NULL,
  size_bytes        bigint NOT NULL,
  r2_key            text NOT NULL,              -- private object key, never a public URL
  width             integer,
  height            integer,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON public.message_attachments (message_id);

-- ─── MESSAGE REACTIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON public.message_reactions (message_id);

-- ─── MESSAGE MENTIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_mentions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id         uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  mentioned_user_id  uuid NOT NULL REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS message_mentions_user_idx ON public.message_mentions (mentioned_user_id);

-- ─── updated_at maintenance ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversations_set_updated_at ON public.conversations;
CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS messages_set_updated_at ON public.messages;
CREATE TRIGGER messages_set_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── last_message_at maintenance ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_last_message();

-- =============================================================================
-- RLS HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND cp.left_at IS NULL
      AND cp.removed_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_internal_conversation_participant(p_conversation_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND cp.participant_kind = 'internal'
      AND cp.left_at IS NULL
      AND cp.removed_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(p_conversation_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND cp.role IN ('owner','admin')
      AND cp.left_at IS NULL
      AND cp.removed_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_mentions          ENABLE ROW LEVEL SECURITY;

-- conversations: visible to workspace members who are participants
DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT
  USING (public.is_workspace_member(workspace_id) AND public.is_conversation_participant(id));

DROP POLICY IF EXISTS conversations_insert ON public.conversations;
CREATE POLICY conversations_insert ON public.conversations FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update ON public.conversations FOR UPDATE
  USING (public.is_workspace_member(workspace_id) AND public.is_conversation_participant(id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- No DELETE policy: conversations are archived/closed, never hard-deleted by users.

-- conversation_participants: visible to any current participant of the same conversation
DROP POLICY IF EXISTS conversation_participants_select ON public.conversation_participants;
CREATE POLICY conversation_participants_select ON public.conversation_participants FOR SELECT
  USING (public.is_workspace_member(workspace_id) AND public.is_conversation_participant(conversation_id));

DROP POLICY IF EXISTS conversation_participants_insert ON public.conversation_participants;
CREATE POLICY conversation_participants_insert ON public.conversation_participants FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND (
      -- creator seeding the initial participant list, or an existing admin adding someone
      added_by = auth.uid()
      AND (public.is_conversation_admin(conversation_id) OR NOT public.is_conversation_participant(conversation_id))
    )
  );

DROP POLICY IF EXISTS conversation_participants_update ON public.conversation_participants;
CREATE POLICY conversation_participants_update ON public.conversation_participants FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND (user_id = auth.uid() OR public.is_conversation_admin(conversation_id))
  )
  WITH CHECK (public.is_workspace_member(workspace_id));

-- messages: participants only; internal notes hidden from non-internal participants
DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT
  USING (
    public.is_workspace_member(workspace_id)
    AND public.is_conversation_participant(conversation_id)
    AND (visibility <> 'internal_note' OR public.is_internal_conversation_participant(conversation_id))
  );

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.is_conversation_participant(conversation_id)
    AND sender_user_id = auth.uid()
  );

DROP POLICY IF EXISTS messages_update ON public.messages;
CREATE POLICY messages_update ON public.messages FOR UPDATE
  USING (public.is_workspace_member(workspace_id) AND sender_user_id = auth.uid())
  WITH CHECK (public.is_workspace_member(workspace_id) AND sender_user_id = auth.uid());

-- No DELETE policy on messages: withdrawal is a status update (withdrawn_at), not a hard delete.

-- message_attachments: inherit conversation participation via message
DROP POLICY IF EXISTS message_attachments_select ON public.message_attachments;
CREATE POLICY message_attachments_select ON public.message_attachments FOR SELECT
  USING (public.is_workspace_member(workspace_id) AND public.is_conversation_participant(conversation_id));

DROP POLICY IF EXISTS message_attachments_insert ON public.message_attachments;
CREATE POLICY message_attachments_insert ON public.message_attachments FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.is_conversation_participant(conversation_id)
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS message_attachments_update ON public.message_attachments;
CREATE POLICY message_attachments_update ON public.message_attachments FOR UPDATE
  USING (public.is_workspace_member(workspace_id) AND uploaded_by = auth.uid())
  WITH CHECK (public.is_workspace_member(workspace_id));

-- message_reactions
DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select ON public.message_reactions FOR SELECT
  USING (
    public.is_workspace_member(workspace_id)
    AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id))
  );

DROP POLICY IF EXISTS message_reactions_insert ON public.message_reactions;
CREATE POLICY message_reactions_insert ON public.message_reactions FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id))
  );

DROP POLICY IF EXISTS message_reactions_delete ON public.message_reactions;
CREATE POLICY message_reactions_delete ON public.message_reactions FOR DELETE
  USING (public.is_workspace_member(workspace_id) AND user_id = auth.uid());

-- message_mentions
DROP POLICY IF EXISTS message_mentions_select ON public.message_mentions;
CREATE POLICY message_mentions_select ON public.message_mentions FOR SELECT
  USING (
    public.is_workspace_member(workspace_id)
    AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id))
  );

DROP POLICY IF EXISTS message_mentions_insert ON public.message_mentions;
CREATE POLICY message_mentions_insert ON public.message_mentions FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_user_id = auth.uid())
  );
