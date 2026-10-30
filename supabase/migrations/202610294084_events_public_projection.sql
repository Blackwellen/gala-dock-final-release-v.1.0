-- P1 events exposure, step 1 of 2 (lane D, 2026-10-29) — ADDITIVE and backward-compatible with the deployed code.
-- Today anon (events_public_read) and every signed-in user (events_read public branch) can read ALL columns of public events,
-- including budget_total / revenue_goal / target_profit / client_name / client_id / lead_id / goal / priorities / guest counts / owner_id,
-- and the raw settings (budget_lines, revenue_sources, objectives, risk, readiness, promotion_plan, ticket_pro.access.comps, invite_token …).
-- This migration adds the public read surface; 202610294085 (staged, applied right after the production deploy) closes the base table.
--   events.public_settings      allow-list projection of settings, maintained by a BEFORE INSERT/UPDATE trigger (any update recomputes it,
--                               so it can't be written directly). ticket_pro keeps only model, sales.* and the public access.* fields.
--   event_public_settings(s)    the allow-list (pure function).
--   events_public               owner-rights security_barrier view: public columns + public_settings AS settings, public + published |
--                               on_sale | live rows only. SELECT for anon and authenticated; nothing else.
--   event_is_public(event)      definer helper for policies of child tables (used by 202610294085).
-- Backfill: bounded, idempotent (only rows whose projection differs).

alter table public.events add column if not exists public_settings jsonb not null default '{}'::jsonb;
comment on column public.events.public_settings is 'Allow-listed public subset of settings (trigger-maintained by events_public_settings_sync; never written directly). Read by anon / outsiders through events_public.';

create or replace function public.event_public_settings(s jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(s) is distinct from 'object' then '{}'::jsonb else
    coalesce((select jsonb_object_agg(k, s -> k) from unnest(array[
      -- page editor / public page content
      'page_blocks', 'public_page', 'cta', 'hero_title', 'hero_image', 'hero_overlay', 'hero_video', 'hero_compact', 'hero_compact_tabs', 'subtitle',
      'seo', 'gallery', 'poster', 'thumb', 'faqs', 'highlights', 'features', 'type_settings', 'accessibility', 'listings', 'style',
      -- public event facts and labels
      'curfew', 'age_limit', 'entry_gate', 'attendance', 'merch_url', 'badge', 'rating', 'reviews', 'featured', 'virtual', 'series_generated',
      -- public sale state / rules
      'launch', 'countdown', 'waiting_list', 'ticketed', 'ticketing_live', 'ticket_capacity', 'ticket_model', 'order_limit', 'transfers', 'resale',
      'reentry', 'refund_policy', 'refund_text']) k where s ? k), '{}'::jsonb)
    || case when jsonb_typeof(s -> 'ticket_pro') = 'object' then jsonb_build_object('ticket_pro', jsonb_strip_nulls(jsonb_build_object(
         'model', s -> 'ticket_pro' -> 'model',
         'sales', case when jsonb_typeof(s -> 'ticket_pro' -> 'sales') = 'object' then s -> 'ticket_pro' -> 'sales' end,
         'access', case when jsonb_typeof(s -> 'ticket_pro' -> 'access') = 'object' then
             (select coalesce(jsonb_object_agg(k, s -> 'ticket_pro' -> 'access' -> k), '{}'::jsonb) from unnest(array[
               'age_text', 'age_message', 'info_text', 'questions', 'refund', 'refund_amount', 'refund_cutoff', 'require_terms', 'terms_template',
               'resale', 'resale_cap', 'transfers', 'companion', 'accessible_seats', 'fee_buyer', 'fee_seller', 'fee_display']) k
              where s -> 'ticket_pro' -> 'access' ? k) end)))
       else '{}'::jsonb end
  end
$$;
comment on function public.event_public_settings(jsonb) is 'Allow-list projection of events.settings for the public read surface. Never: invite_token, admin_restriction, budget/revenue/objectives/risk/readiness, promotion_plan, distribution, demo/seed keys, getting_there, ticket_pro.access.comps / activated_at / phases / sections / capacity / buffer_pct.';
grant execute on function public.event_public_settings(jsonb) to anon, authenticated;

create or replace function public.events_public_settings_sync() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.public_settings := public.event_public_settings(coalesce(new.settings, '{}'::jsonb));
  return new;
end $$;
grant execute on function public.events_public_settings_sync() to authenticated;
-- zz_: BEFORE triggers fire in name order, so this runs after any other BEFORE trigger that may adjust settings.
drop trigger if exists events_zz_public_settings on public.events;
create trigger events_zz_public_settings before insert or update on public.events for each row execute function public.events_public_settings_sync();

create or replace function public.event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.visibility = 'public' and e.status in ('published', 'on_sale', 'live'))
$$;
revoke all on function public.event_is_public(uuid) from public;
grant execute on function public.event_is_public(uuid) to anon, authenticated;

create or replace view public.events_public with (security_barrier = true) as
  select e.id, e.name, e.slug, e.description, e.event_type, e.starts_at, e.ends_at, e.timezone, e.venue_name, e.location, e.city, e.cover_image, e.tags,
         e.capacity, e.status, e.visibility, e.currency, e.venue_listing_id, e.series_id, e.series_index, e.occurrence_key, e.parent_event_id,
         e.composition_role, e.workspace_id, e.created_at, e.updated_at, e.public_settings as settings
    from public.events e
   where e.visibility = 'public' and e.status in ('published', 'on_sale', 'live');
comment on view public.events_public is 'Public read surface for events (owner-rights, security_barrier): public columns + allow-listed settings, public published / on_sale / live rows only. Never budget, revenue, profit, client, lead, goal, priorities, guest counts, owner or raw settings.';
revoke all on public.events_public from public, anon, authenticated;
grant select on public.events_public to anon, authenticated;

-- Backfill (bounded + idempotent; the trigger recomputes the same value).
update public.events set public_settings = public.event_public_settings(coalesce(settings, '{}'::jsonb))
 where public_settings is distinct from public.event_public_settings(coalesce(settings, '{}'::jsonb));
