-- Public event calendar fields on event_public_pages (anon-readable for published rows).
ALTER TABLE public.event_public_pages ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.event_public_pages ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.event_public_pages ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.event_public_pages ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS event_public_pages_published_starts_idx ON public.event_public_pages (published, starts_at);
