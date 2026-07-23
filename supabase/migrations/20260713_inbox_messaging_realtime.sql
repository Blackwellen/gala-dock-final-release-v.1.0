-- Enable Supabase Realtime (postgres_changes) for the canonical messaging
-- tables so the full Inbox and the Gala Copilot Inbox panel receive live
-- updates for new messages, edits/withdrawals, reactions and read state.
-- Idempotent: guards against the table already being a publication member
-- (re-adding an existing member raises a duplicate_object error otherwise).

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'conversations',
    'conversation_participants',
    'messages',
    'message_reactions',
    'message_mentions',
    'message_attachments'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
