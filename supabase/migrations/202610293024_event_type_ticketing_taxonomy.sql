-- W11 backend (lane C, 2026-10-29) — (a) per-type ticketing mode + (d) event-type taxonomy → profile map. Additive only.
--
-- (a) event_type_profiles.ticketing:
--       default_on   — concert, festival, nightlife, conference, webinar, charity, custom: tickets are part of the event type.
--       optional_off — wedding, birthday, gala: ticketing is OFF until the host switches it on (ticket setup sets settings.ticketed).
--       private_only — childrens_party: invite-only, never sold publicly (the event is always private — 2012 row guard).
--     Enforced in 3025 (ticket_tiers row trigger, every writer). Existing on-sale tiers keep selling (only NEW on_sale/scheduled
--     transitions are checked, and an event that is already selling is grandfathered).
--
-- (d) event_type_aliases: every Q02 `event_type` taxonomy term (src/lib/master-data/catalog.ts) resolves to exactly one profile —
--     itself (canonical), a canonical profile (alias), or an explicit `custom` alias. Wizard tile placement hints for the customer
--     Plan wizard (plan_tile) and the organiser create-event wizard (organizer_tile, adds gala/charity/conference per the W11 note).
--     Read-only config: anon/authenticated may SELECT (like event_type_profiles); writes are service-only.

alter table public.event_type_profiles add column if not exists ticketing text not null default 'default_on';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_type_profiles_ticketing_check' and conrelid = 'public.event_type_profiles'::regclass) then
    alter table public.event_type_profiles add constraint event_type_profiles_ticketing_check check (ticketing in ('default_on', 'optional_off', 'private_only'));
  end if;
end $$;
update public.event_type_profiles p set ticketing = v.mode, updated_at = now()
  from (values ('wedding', 'optional_off'), ('birthday', 'optional_off'), ('gala', 'optional_off'), ('childrens_party', 'private_only'),
               ('concert', 'default_on'), ('festival', 'default_on'), ('nightlife', 'default_on'), ('conference', 'default_on'),
               ('webinar', 'default_on'), ('charity', 'default_on'), ('custom', 'default_on')) v(t, mode)
  where p.event_type = v.t and p.ticketing is distinct from v.mode;
comment on column public.event_type_profiles.ticketing is
  'W11: default_on | optional_off (host must switch ticketing on: settings.ticketed) | private_only (invite-only, never public). Enforced by trg_ticket_tier_ticketing_guard.';

create table if not exists public.event_type_aliases (
  event_type text primary key check (event_type ~ '^[a-z][a-z0-9_]{1,39}$'),
  profile text not null references public.event_type_profiles(event_type) on update cascade,
  kind text not null check (kind in ('canonical', 'alias', 'custom_alias')),
  label text not null check (length(label) between 1 and 80),
  plan_tile text check (plan_tile in ('primary', 'more')),
  organizer_tile boolean not null default false,
  sort integer not null default 100,
  note text not null default '',
  updated_at timestamptz not null default now(),
  constraint event_type_aliases_canonical_ck check ((kind = 'canonical') = (event_type = profile)),
  constraint event_type_aliases_custom_ck check (kind <> 'custom_alias' or profile = 'custom')
);
alter table public.event_type_aliases enable row level security;
revoke all on table public.event_type_aliases from public, anon, authenticated;
grant select on table public.event_type_aliases to anon, authenticated;
grant all on table public.event_type_aliases to service_role;
drop policy if exists event_type_aliases_read on public.event_type_aliases;
create policy event_type_aliases_read on public.event_type_aliases for select to anon, authenticated using (true);

insert into public.event_type_aliases(event_type, profile, kind, label, plan_tile, organizer_tile, sort, note) values
  -- canonical profiles
  ('wedding',         'wedding',         'canonical', 'Wedding',              'primary', true,  10, ''),
  ('birthday',        'birthday',        'canonical', 'Birthday',             'primary', true,  20, ''),
  ('festival',        'festival',        'canonical', 'Festival',             'primary', true,  50, ''),
  ('nightlife',       'nightlife',       'canonical', 'Nightclub',            'primary', true,  60, ''),
  ('childrens_party', 'childrens_party', 'canonical', 'Children''s Party',    'primary', true,  80, 'Never public; invite-only tickets.'),
  ('concert',         'concert',         'canonical', 'Concert / Live Show',  null,      true,  45, ''),
  ('conference',      'conference',      'canonical', 'Conference',           'more',    true,  90, 'W11: add organiser tile.'),
  ('gala',            'gala',            'canonical', 'Gala',                 'more',    true,  95, 'W11: add organiser tile.'),
  ('charity',         'charity',         'canonical', 'Charity / Fundraiser', 'more',    true,  96, 'W11: add organiser tile.'),
  ('webinar',         'webinar',         'canonical', 'Webinar / Virtual',    'more',    true,  97, 'Online: no venue.'),
  ('custom',          'custom',          'canonical', 'Something else',       'more',    false, 999, 'Fallback for unknown types.'),
  -- wizard types → canonical profiles
  ('party',           'birthday',        'alias',     'Party',                'primary', false, 40, 'Private celebration profile (guest privacy private, ticketing optional). Public club nights use nightlife.'),
  ('private_dinner',  'birthday',        'alias',     'Private Dinner',       'primary', false, 70, 'Private celebration profile.'),
  ('private_party',   'birthday',        'alias',     'Private Party',        null,      false, 41, 'Private celebration profile.'),
  ('awards',          'gala',            'alias',     'Awards',               'more',    false, 98, 'Awards dinners follow the gala profile (guests, seating, run of show).'),
  ('comedy',          'concert',         'alias',     'Comedy',               'more',    false, 99, 'Ticketed performance: acts, capacity and end time.'),
  ('theatre',         'concert',         'alias',     'Theatre',              null,      false, 120, 'Ticketed performance.'),
  ('graduation',      'gala',            'alias',     'Graduation / Prom',    null,      false, 121, 'Formal dinner profile.'),
  -- explicit custom aliases (no stronger profile fits; venue only)
  ('corporate',       'custom',          'custom_alias', 'Corporate Event',   'primary', true,  30, 'Corporate events vary (launches, offsites, parties): custom rules.'),
  ('community',       'custom',          'custom_alias', 'Community / Sport', 'more',    true,  100, ''),
  ('food_drink',      'custom',          'custom_alias', 'Food & Drink',      'more',    false, 101, 'Tastings to street-food markets: custom rules.'),
  ('exhibition',      'custom',          'custom_alias', 'Exhibition',        null,      false, 130, ''),
  ('product_launch',  'custom',          'custom_alias', 'Product Launch',    null,      false, 131, ''),
  ('networking',      'custom',          'custom_alias', 'Networking',        null,      false, 132, ''),
  ('sports',          'custom',          'custom_alias', 'Sports',            null,      false, 133, ''),
  ('arts',            'custom',          'custom_alias', 'Art & Culture',     null,      false, 134, ''),
  ('religious',       'custom',          'custom_alias', 'Faith & Cultural',  null,      false, 135, ''),
  ('seasonal',        'custom',          'custom_alias', 'Seasonal / Holiday', null,     false, 136, ''),
  ('family',          'custom',          'custom_alias', 'Family',            null,      false, 137, 'Public family events; children''s parties use childrens_party.'),
  ('production',      'custom',          'custom_alias', 'Production',        null,      false, 138, '')
on conflict (event_type) do update set profile = excluded.profile, kind = excluded.kind, label = excluded.label, plan_tile = excluded.plan_tile,
  organizer_tile = excluded.organizer_tile, sort = excluded.sort, note = excluded.note, updated_at = now();

-- Resolver: event type (any spelling case) → its profile row; unknown types fall back to `custom`.
create or replace function public.event_type_profile_of(p_type text) returns public.event_type_profiles
language plpgsql stable security definer set search_path = '' as $$
declare k text := lower(btrim(coalesce(p_type, ''))); r public.event_type_profiles;
begin
  select p.* into r from public.event_type_profiles p
    where p.event_type = coalesce((select a.profile from public.event_type_aliases a where a.event_type = k), k);
  if not found then select p.* into r from public.event_type_profiles p where p.event_type = 'custom'; end if;
  return r;
end $$;
revoke all on function public.event_type_profile_of(text) from public, anon, authenticated;
grant execute on function public.event_type_profile_of(text) to service_role;

-- UI lookup (lanes B/D): the resolved rules for one event type, including how the wizards should present it.
create or replace function public.event_type_rules(p_type text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare k text := lower(btrim(coalesce(p_type, ''))); p public.event_type_profiles; a public.event_type_aliases;
begin
  if length(k) > 40 then raise exception 'invalid_event_type' using errcode = '22023'; end if;
  p := public.event_type_profile_of(k);
  select * into a from public.event_type_aliases where event_type = k;
  return jsonb_build_object(
    'event_type', k, 'profile', p.event_type, 'kind', coalesce(a.kind, 'unknown'), 'label', coalesce(a.label, initcap(replace(k, '_', ' '))),
    'online', p.online, 'requires_venue', p.requires_venue and not p.online, 'requires_end', p.requires_end, 'requires_capacity', p.requires_capacity,
    'requires_guests', p.requires_guests, 'requires_programme', p.requires_programme, 'public_listing_allowed', p.public_listing_allowed,
    'guest_privacy', p.guest_privacy, 'ticketing', p.ticketing, 'tickets_default_on', p.ticketing = 'default_on',
    -- (b) private guest privacy: no public share preview / OG card, guest list and RSVP never public.
    'share_preview', p.public_listing_allowed and p.guest_privacy = 'standard',
    'modules', to_jsonb(p.modules), 'notes', p.notes, 'plan_tile', a.plan_tile, 'organizer_tile', coalesce(a.organizer_tile, false));
end $$;
revoke all on function public.event_type_rules(text) from public, anon, authenticated;
grant execute on function public.event_type_rules(text) to authenticated, service_role;
