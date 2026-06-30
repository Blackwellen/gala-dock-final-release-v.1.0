-- EB-F: extend the existing event_rooms join table with standalone-room fields.
ALTER TABLE public.event_rooms ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.event_rooms ADD COLUMN IF NOT EXISTS capacity integer;
ALTER TABLE public.event_rooms ADD COLUMN IF NOT EXISTS layout_mode text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='event_rooms_layout_mode_check') THEN
    ALTER TABLE public.event_rooms ADD CONSTRAINT event_rooms_layout_mode_check
      CHECK (layout_mode IS NULL OR layout_mode IN ('seated','standing','hybrid','capacity'));
  END IF;
END$$;
