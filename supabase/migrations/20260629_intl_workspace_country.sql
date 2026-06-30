-- Gala Dock — INTL-6: workspace country (drives locale/currency/tax/legal country packs).
-- Additive, idempotent. workspaces already carry `currency` and `locale`; `country` links the
-- workspace to its CountryPack (src/lib/i18n/countries.ts) for tax + legal compliance. Default GB.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'GB';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_country_check') THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_country_check
      CHECK (country IN (
        'GB','US','CA','FR','DE','BE','ES','PT','IT','SE','DK','FI','AT','HU','HR','GL',
        'CH','AE','SA','QA','TH','JP','TW','SG'
      ));
  END IF;
END$$;

COMMENT ON COLUMN public.workspaces.country IS
  'ISO-3166-1 alpha-2 country code. Links the workspace to its INTL CountryPack (locale, currency, tax system, e-invoicing, privacy regime, RTL). Default GB.';
