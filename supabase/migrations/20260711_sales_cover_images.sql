-- Gala Dock — Sales cards: real seeded cover photography.
-- Additive-only. Mirrors the `cover_image_url` convention already used by
-- public.events (see supabase/seeds/demo-events-full-seed.sql).

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cover_image_url text;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN public.leads.cover_image_url IS
  'Optional real photo URL for card/list thumbnails. Falls back to a deterministic gradient (EventTypeThumb) when null.';
COMMENT ON COLUMN public.proposals.cover_image_url IS
  'Optional real photo URL for card/list thumbnails. Falls back to a deterministic gradient (EventTypeThumb) when null.';
