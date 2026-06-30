-- Gala Dock — EB: per-event layout/admission mode. NULL = inherit from event type default.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS layout_mode text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='events_layout_mode_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_layout_mode_check
      CHECK (layout_mode IS NULL OR layout_mode IN ('seated','standing','hybrid','capacity'));
  END IF;
END$$;
COMMENT ON COLUMN public.events.layout_mode IS 'seated | standing | hybrid | capacity. NULL inherits the event type default (LAYOUT_MODE_BY_TYPE).';
