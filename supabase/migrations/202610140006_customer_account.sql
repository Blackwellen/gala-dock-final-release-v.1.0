-- Customer account (CU-013): profile details, preferences, avatar storage, calendar feed token, scheduled deletion.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists country text not null default 'GB';
alter table public.profiles add column if not exists language text not null default 'en';
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists calendar_token text unique;
alter table public.profiles add column if not exists deletion_requested_at timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_bio_len check (length(bio) <= 250);
exception when duplicate_object then null; end $$;

-- Whitelisted self-service update (column grants stay narrow; status/identity fields are never writable here).
create or replace function public.update_my_profile(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare dob date;
begin
  if auth.uid() is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p ? 'full_name' and (length(trim(p->>'full_name')) < 2 or length(p->>'full_name') > 120) then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p ? 'phone' and coalesce(p->>'phone', '') <> '' and (p->>'phone') !~ '^\+?[0-9 ()-]{7,20}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if p ? 'country' and (p->>'country') !~ '^[A-Z]{2}$' then raise exception 'invalid_country' using errcode = '22023'; end if;
  if p ? 'language' and (p->>'language') not in ('en','fr','de','es','it','pt','nl','pl','ar','zh') then raise exception 'invalid_language' using errcode = '22023'; end if;
  if p ? 'bio' and length(p->>'bio') > 250 then raise exception 'invalid_bio' using errcode = '22023'; end if;
  if p ? 'date_of_birth' and coalesce(p->>'date_of_birth', '') <> '' then
    dob := (p->>'date_of_birth')::date;
    if dob > current_date - interval '13 years' or dob < date '1900-01-01' then raise exception 'invalid_dob' using errcode = '22023'; end if;
  end if;
  if p ? 'notifications' and jsonb_typeof(p->'notifications') <> 'object' then raise exception 'invalid_notifications' using errcode = '22023'; end if;
  update public.profiles set
    full_name = case when p ? 'full_name' then trim(p->>'full_name') else full_name end,
    phone = case when p ? 'phone' then nullif(trim(p->>'phone'), '') else phone end,
    country = coalesce(p->>'country', country),
    language = coalesce(p->>'language', language),
    bio = case when p ? 'bio' then trim(p->>'bio') else bio end,
    date_of_birth = case when p ? 'date_of_birth' then nullif(p->>'date_of_birth', '')::date else date_of_birth end,
    notifications = case when p ? 'notifications' then coalesce(notifications, '{}') || (p->'notifications') else notifications end,
    marketing_opt_in = case when p->'notifications' ? 'marketing' then (p->'notifications'->>'marketing')::boolean else marketing_opt_in end,
    marketing_opt_in_at = case when p->'notifications' ? 'marketing' and (p->'notifications'->>'marketing')::boolean then now() else marketing_opt_in_at end
  where id = auth.uid();
end $$;

create or replace function public.set_my_avatar(p_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_url !~ ('/storage/v1/object/public/avatars/' || auth.uid()::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then raise exception 'invalid_avatar' using errcode = '22023'; end if;
  update public.profiles set avatar_url = p_url where id = auth.uid();
end $$;

create or replace function public.rotate_calendar_token() returns text
language plpgsql security definer set search_path = '' as $$
declare t text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.profiles set calendar_token = t where id = auth.uid();
  return t;
end $$;

-- Deletion is scheduled (30-day grace, cancellable); an operator job performs the erasure.
create or replace function public.request_account_deletion(p_cancel boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set deletion_requested_at = case when p_cancel then null else now() end where id = auth.uid();
end $$;

-- Calendar feed (token-authenticated, used by /api/calendar/[token]): the owner's events and ticketed events.
create or replace function public.calendar_feed(p_token text)
returns table(uid text, title text, starts_at timestamptz, ends_at timestamptz, location text, kind text)
language sql stable security definer set search_path = '' as $$
  with u as (select id from public.profiles where calendar_token = p_token and length(p_token) = 48)
  select e.id::text, e.name, e.starts_at, e.ends_at, concat_ws(', ', nullif(e.venue_name, ''), nullif(e.location, '')), 'event'
    from public.events e join u on e.owner_id = u.id where e.starts_at is not null and e.status not in ('cancelled','archived','draft')
  union
  select e.id::text || '-t', e.name, e.starts_at, e.ends_at, concat_ws(', ', nullif(e.venue_name, ''), nullif(e.location, '')), 'ticket'
    from public.tickets t join u on t.holder_id = u.id join public.events e on e.id = t.event_id where t.status in ('valid','resale_listed') and e.starts_at is not null;
$$;

revoke all on function public.update_my_profile(jsonb) from public, anon;
revoke all on function public.set_my_avatar(text) from public, anon;
revoke all on function public.rotate_calendar_token() from public, anon;
revoke all on function public.request_account_deletion(boolean) from public, anon;
revoke all on function public.calendar_feed(text) from public, anon, authenticated;
grant execute on function public.update_my_profile(jsonb) to authenticated;
grant execute on function public.set_my_avatar(text) to authenticated;
grant execute on function public.rotate_calendar_token() to authenticated;
grant execute on function public.request_account_deletion(boolean) to authenticated;

-- Public avatar images, writable only inside the owner's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 5242880, array['image/png','image/jpeg','image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
grant execute on function public.calendar_feed(text) to service_role;
