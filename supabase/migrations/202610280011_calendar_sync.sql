-- Two-way calendar sync (Google / Microsoft 365) on top of the private ICS feed.
-- Outbound: the user's Gala Dock events and tickets (calendar_feed) are written into a "Gala Dock" calendar they own.
-- Inbound: busy times from their primary calendar are pulled back as private busy blocks shown on the organizer calendar.
-- OAuth tokens are stored encrypted (AES-256-GCM, app-side) in a table no client role can read; the app talks to it with the
-- service role. Clients only see connection status through my_calendar_connections().

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  account_email text,
  token_enc text not null,                 -- encrypted JSON {access_token, refresh_token, expires_at}
  calendar_id text,                        -- the dedicated "Gala Dock" calendar we write to
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.calendar_connections enable row level security;
revoke all on public.calendar_connections from anon, authenticated;

-- Outbound mapping: feed uid → provider event id, plus a hash so unchanged events aren't rewritten.
create table if not exists public.calendar_sync_links (
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  source_uid text not null,
  external_id text not null,
  content_hash text not null,
  primary key (connection_id, source_uid)
);
alter table public.calendar_sync_links enable row level security;
revoke all on public.calendar_sync_links from anon, authenticated;

-- Inbound busy blocks. Only the time range is kept (no titles, attendees or descriptions) and only the owner can read them.
create table if not exists public.calendar_busy_blocks (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at)
);
create index if not exists calendar_busy_blocks_user_idx on public.calendar_busy_blocks (user_id, starts_at);
alter table public.calendar_busy_blocks enable row level security;
revoke all on public.calendar_busy_blocks from anon, authenticated;
grant select on public.calendar_busy_blocks to authenticated;
drop policy if exists busy_own on public.calendar_busy_blocks;
create policy busy_own on public.calendar_busy_blocks for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.my_calendar_connections()
returns table (provider text, account_email text, status text, last_error text, last_synced_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.provider, c.account_email, c.status, c.last_error, c.last_synced_at
    from public.calendar_connections c where c.user_id = (select auth.uid()) order by c.provider;
$$;

-- Disconnect removes tokens, links and busy blocks (cascade). The provider-side calendar is left for the user to keep or delete.
create or replace function public.disconnect_my_calendar(p_provider text)
returns void language sql security definer set search_path = '' as $$
  delete from public.calendar_connections where user_id = (select auth.uid()) and provider = p_provider;
$$;

revoke all on function public.my_calendar_connections() from public, anon;
revoke all on function public.disconnect_my_calendar(text) from public, anon;
grant execute on function public.my_calendar_connections() to authenticated;
grant execute on function public.disconnect_my_calendar(text) to authenticated;

-- Same rows as calendar_feed, keyed by user (service role only; used by the sync worker).
create or replace function public.calendar_feed_for_user(p_user uuid)
returns table(uid text, title text, starts_at timestamptz, ends_at timestamptz, location text, kind text)
language sql stable security definer set search_path = '' as $$
  select e.id::text, e.name, e.starts_at, e.ends_at, concat_ws(', ', nullif(e.venue_name, ''), nullif(e.location, '')), 'event'
    from public.events e where e.owner_id = p_user and e.starts_at is not null and e.status not in ('cancelled','archived','draft')
  union
  select e.id::text || '-t', e.name, e.starts_at, e.ends_at, concat_ws(', ', nullif(e.venue_name, ''), nullif(e.location, '')), 'ticket'
    from public.tickets t join public.events e on e.id = t.event_id where t.holder_id = p_user and t.status in ('valid','resale_listed') and e.starts_at is not null;
$$;
revoke all on function public.calendar_feed_for_user(uuid) from public, anon, authenticated;
grant execute on function public.calendar_feed_for_user(uuid) to service_role;

-- Hourly worker; dispatch_worker is a no-op until the vault holds app_url + cron_secret.
select cron.unschedule('calendar-sync') where exists (select 1 from cron.job where jobname = 'calendar-sync');
select cron.schedule('calendar-sync', '17 * * * *', $$select public.dispatch_worker('/api/cron/calendar-sync')$$);
