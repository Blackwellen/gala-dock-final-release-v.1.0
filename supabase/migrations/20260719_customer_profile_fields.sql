-- =============================================================================
-- Gala Dock — Customer onboarding profile fields
-- Extends the standalone `customers` identity (see 20260716_consumer_marketplace_
-- foundation.sql) with the real fields the Customer onboarding wizard collects,
-- so answers land in proper typed columns rather than staying in the onboarding
-- session's draft jsonb. Idempotent.
-- =============================================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type text
    CHECK (customer_type IN ('individual','business','charity','school','club','community','agency','other')),
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text
    CHECK (preferred_contact_method IN ('email','phone','sms')) DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/London',
  ADD COLUMN IF NOT EXISTS event_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"proposals":true,"documents":true,"invoices":true,"event_updates":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_address jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.customers.event_preferences IS 'Free-form event-type/location/size preferences collected during onboarding.';
COMMENT ON COLUMN public.customers.notification_preferences IS 'Per-channel notification toggles; marketing/SMS consent are separate columns per spec (never bundled with mandatory terms).';
