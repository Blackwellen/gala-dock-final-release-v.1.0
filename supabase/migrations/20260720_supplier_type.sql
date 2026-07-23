-- Gala Dock — supplier agency vs. solo (nav depth planning).
--
-- Adds workspaces.supplier_type: distinguishes a solo supplier (one operator, no roster)
-- from an agency (manages an internal team/roster and assigns jobs to them). Irrelevant
-- for organizer/venue workspaces but kept on the same row rather than a side table since
-- it is read alongside workspace_type/release_stage/plan in the same persona-context query
-- (see src/lib/flags/context.ts). Only gates nav/UI depth — no RLS/plan implications.

alter table public.workspaces
  add column if not exists supplier_type text not null default 'solo';

alter table public.workspaces
  drop constraint if exists workspaces_supplier_type_check;

alter table public.workspaces
  add constraint workspaces_supplier_type_check check (supplier_type in ('solo', 'agency'));

comment on column public.workspaces.supplier_type is
  'Supplier persona depth: solo (no roster) or agency (manages an internal team/roster). Ignored for organizer/venue workspaces.';
