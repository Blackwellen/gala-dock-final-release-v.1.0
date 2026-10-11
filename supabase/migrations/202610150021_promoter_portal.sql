-- PROM-001 Promoter portal: promoter logins, click tracking (/r/<code>), attributed sales, shared campaign assets, payouts.
-- A promoter (promoters.user_id = auth.uid()) sees only their own rows. Event managers keep full access via can_access_event.
begin;

alter table public.promoters
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists email text not null default '',
  add column if not exists payout_method text,
  add column if not exists created_at timestamptz not null default now();
create index if not exists promoters_user_idx on public.promoters(user_id) where user_id is not null;
create index if not exists promoters_code_idx on public.promoters(upper(code));

-- Definer helpers avoid RLS recursion between events and promoters.
create or replace function public.is_event_promoter(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.promoters p where p.event_id = p_event and p.user_id = (select auth.uid()) and p.status <> 'paused');
$$;
create or replace function public.owns_promoter(p_promoter uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.promoters p where p.id = p_promoter and p.user_id = (select auth.uid()));
$$;
create or replace function public.can_manage_promoter(p_promoter uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.promoters p where p.id = p_promoter and public.can_access_event(p.event_id));
$$;
revoke all on function public.is_event_promoter(uuid), public.owns_promoter(uuid), public.can_manage_promoter(uuid) from public, anon;
grant execute on function public.is_event_promoter(uuid), public.owns_promoter(uuid), public.can_manage_promoter(uuid) to authenticated;

drop policy if exists promoters_self_read on public.promoters;
create policy promoters_self_read on public.promoters for select to authenticated using (user_id = (select auth.uid()));
-- Promoters can read the event they promote even while it is private (drafts / pre-launch campaigns).
drop policy if exists events_promoter_read on public.events;
create policy events_promoter_read on public.events for select to authenticated using (public.is_event_promoter(id));
drop policy if exists tiers_promoter_read on public.ticket_tiers;
create policy tiers_promoter_read on public.ticket_tiers for select to authenticated using (public.is_event_promoter(event_id));

-- Campaign assets shared by the organizer with every promoter of the event.
create table if not exists public.promoter_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  kind text not null default 'image' check (kind in ('image','poster','video','story','banner','copy')),
  image text not null default '',
  url text not null default '',
  caption text not null default '' check (length(caption) <= 2000),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists promoter_assets_event_idx on public.promoter_assets(event_id, sort);

-- One row per counted click (deduplicated per visitor per window by promoter_track_click).
create table if not exists public.promoter_clicks (
  id bigint generated always as identity primary key,
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  channel text not null default 'direct' check (channel in ('direct','instagram','tiktok','facebook','x','whatsapp','email','other')),
  asset_id uuid references public.promoter_assets(id) on delete set null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists promoter_clicks_promoter_idx on public.promoter_clicks(promoter_id, created_at desc);

-- Ticket orders attributed to a promoter code (written by checkout/webhook with the service role; read-only here).
create table if not exists public.promoter_sales (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid references public.ticket_tiers(id) on delete set null,
  tier_name text not null,
  quantity integer not null check (quantity > 0),
  amount numeric(12,2) not null check (amount >= 0),
  commission numeric(12,2) not null check (commission >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','reversed')),
  channel text not null default 'direct',
  asset_id uuid references public.promoter_assets(id) on delete set null,
  order_ref text,
  payout_id uuid,
  sold_at timestamptz not null default now()
);
create index if not exists promoter_sales_promoter_idx on public.promoter_sales(promoter_id, sold_at desc);

create table if not exists public.promoter_payouts (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','processing','paid','failed','on_hold')),
  scheduled_for date not null,
  paid_at timestamptz,
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists promoter_payouts_promoter_idx on public.promoter_payouts(promoter_id, scheduled_for desc);

alter table public.promoter_assets enable row level security;
alter table public.promoter_clicks enable row level security;
alter table public.promoter_sales enable row level security;
alter table public.promoter_payouts enable row level security;

drop policy if exists promoter_assets_read on public.promoter_assets;
create policy promoter_assets_read on public.promoter_assets for select to authenticated using (public.is_event_promoter(event_id) or public.can_access_event(event_id));
drop policy if exists promoter_assets_write on public.promoter_assets;
create policy promoter_assets_write on public.promoter_assets for all to authenticated using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));
drop policy if exists promoter_clicks_read on public.promoter_clicks;
create policy promoter_clicks_read on public.promoter_clicks for select to authenticated using (public.owns_promoter(promoter_id) or public.can_manage_promoter(promoter_id));
drop policy if exists promoter_sales_read on public.promoter_sales;
create policy promoter_sales_read on public.promoter_sales for select to authenticated using (public.owns_promoter(promoter_id) or public.can_manage_promoter(promoter_id));
drop policy if exists promoter_payouts_read on public.promoter_payouts;
create policy promoter_payouts_read on public.promoter_payouts for select to authenticated using (public.owns_promoter(promoter_id) or public.can_manage_promoter(promoter_id));

revoke all on public.promoter_assets, public.promoter_clicks, public.promoter_sales, public.promoter_payouts from anon, authenticated;
grant select, insert, update, delete on public.promoter_assets to authenticated;
grant select (id, promoter_id, channel, asset_id, created_at) on public.promoter_clicks to authenticated;
grant select on public.promoter_sales, public.promoter_payouts to authenticated;

-- ── Referral click: /r/<code> → resolves the promoter, counts at most one click per visitor per 30 minutes, returns the event slug.
-- p_visitor is a server-computed SHA-256 of (ip, user agent); the raw IP never reaches the database.
create or replace function public.promoter_track_click(p_code text, p_visitor text, p_channel text default 'direct', p_asset uuid default null)
returns table(slug text, code text, counted boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare p record; v_channel text; v_counted boolean := false;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{2,32}$' or p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' then return; end if;
  -- Codes are unique per event; prefer the active promoter whose public event is soonest upcoming.
  select pr.id, pr.code, e.slug, e.id as event_id into p
    from public.promoters pr join public.events e on e.id = pr.event_id
    where upper(pr.code) = upper(p_code) and pr.status = 'active' and e.slug is not null
      and e.visibility = 'public' and e.status in ('published','on_sale','live')
    order by (coalesce(e.ends_at, e.starts_at) < now()), e.starts_at nulls last limit 1;
  if p.id is null then return; end if;
  v_channel := case when p_channel in ('direct','instagram','tiktok','facebook','x','whatsapp','email','other') then p_channel else 'other' end;
  -- Global per-visitor ceiling first (bots cycling codes), then one counted click per visitor+promoter per window.
  if public.hit_rate_limit('promo:visitor:' || p_visitor, 60, 3600)
     and public.hit_rate_limit('promo:click:' || p.id || ':' || p_visitor, 1, 1800) then
    insert into public.promoter_clicks(promoter_id, channel, asset_id, visitor_hash)
      values (p.id, v_channel, (select a.id from public.promoter_assets a where a.id = p_asset and a.event_id = p.event_id), p_visitor);
    update public.promoters set clicks = clicks + 1 where id = p.id;
    v_counted := true;
  end if;
  return query select p.slug::text, p.code::text, v_counted;
end $$;

-- Leaderboard for one promoter's event: ranks by tickets sold; exposes only names and ticket counts.
create or replace function public.promoter_leaderboard(p_promoter uuid)
returns table(rank bigint, name text, tickets_sold integer, is_you boolean)
language sql stable security definer set search_path = '' as $$
  select rank() over (order by x.tickets_sold desc), x.name, x.tickets_sold, x.user_id = (select auth.uid())
  from public.promoters x
  where x.event_id = (select p.event_id from public.promoters p where p.id = p_promoter and p.user_id = (select auth.uid()))
    and x.status in ('active','pending')
  order by 1, 2;
$$;

-- The promoter records how they want to be paid (a label only — bank details are collected by the payment provider).
create or replace function public.promoter_set_payout_method(p_promoter uuid, p_method text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_ws uuid; v_event uuid;
begin
  if not public.owns_promoter(p_promoter) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_method is not null and p_method not in ('bank_transfer','paypal','stripe') then raise exception 'invalid_input' using errcode = '22023'; end if;
  update public.promoters set payout_method = p_method where id = p_promoter returning event_id into v_event;
  select workspace_id into v_ws from public.events where id = v_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), v_ws, 'promoter.payout_method_set', jsonb_build_object('promoter_id', p_promoter, 'method', p_method));
end $$;

revoke all on function public.promoter_track_click(text, text, text, uuid), public.promoter_leaderboard(uuid), public.promoter_set_payout_method(uuid, text) from public;
grant execute on function public.promoter_track_click(text, text, text, uuid) to anon, authenticated;
grant execute on function public.promoter_leaderboard(uuid), public.promoter_set_payout_method(uuid, text) to authenticated;

commit;
