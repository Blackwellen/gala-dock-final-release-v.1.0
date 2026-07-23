-- Gala Dock — Marketplace Phase 4a: card-level columns on marketplace_listings so the browse
-- dashboard and listing cards (SupplierMarketplaceCard/VenueMarketplaceCard) can read real rows
-- instead of src/lib/marketplace/fixtures.ts. Deep profile-page-only content (packages,
-- certifications, portfolio images, spaces, reviews text) is deliberately NOT added here — that
-- needs its own child tables (marketplace_service_packages, marketplace_venue_spaces, etc.) and
-- is left on fixtures for a later pass so this migration stays scoped to what the dashboard/card
-- surfaces actually need.
--
-- `slug` identifies an individual listing (used by /marketplace/venues/[slug] and
-- /marketplace/services/[slug]). Company/venue-operator profile pages
-- (/marketplace/suppliers/[slug], /marketplace/venue-owners/[slug]) key off the existing
-- workspaces.slug column instead — one workspace can own several listings, exactly like the
-- Phase 2 fixtures' "Floral & Co. Events" owning both venue listings and a styling service.

alter table public.marketplace_listings
  add column if not exists slug text,
  add column if not exists verified boolean not null default false,
  add column if not exists featured boolean not null default false,
  add column if not exists top_rated boolean not null default false,
  add column if not exists preferred boolean not null default false,
  add column if not exists response_rate integer check (response_rate between 0 and 100),
  add column if not exists response_time_label text,
  add column if not exists lead_time_label text,
  add column if not exists compliance_grade text check (compliance_grade in ('A', 'B', 'C')),
  add column if not exists tags text[] not null default '{}',
  add column if not exists seated_capacity integer,
  add column if not exists standing_capacity integer,
  add column if not exists accessible boolean;

create unique index if not exists marketplace_listings_slug_key on public.marketplace_listings (slug) where slug is not null;
