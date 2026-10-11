-- Phase 3: provider-side messaging helpers.
-- Providers may not edit the requester's messages, so read receipts go through a narrow function.
begin;

create or replace function public.provider_mark_thread_read(p_thread uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.threads; n integer;
begin
  select * into t from public.threads where id = p_thread;
  if not found or t.listing_id is null or not public.is_listing_provider(t.listing_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  update public.messages set read_at = now() where thread_id = t.id and not from_provider and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.provider_send_message(p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.threads; mid uuid; nm text;
begin
  select * into t from public.threads where id = p_thread;
  if not found or t.listing_id is null or not public.is_listing_provider(t.listing_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'body_required' using errcode = '22023'; end if;
  select coalesce(nullif(w.name, ''), 'Provider') into nm from public.listings l join public.workspaces w on w.id = l.workspace_id where l.id = t.listing_id;
  insert into public.messages(thread_id, sender_id, sender_name, from_provider, body) values (t.id, auth.uid(), nm, true, left(trim(p_body), 5000)) returning id into mid;
  update public.threads set updated_at = now() where id = t.id;
  return mid;
end $$;

revoke all on function public.provider_mark_thread_read(uuid), public.provider_send_message(uuid, text) from public, anon;
grant execute on function public.provider_mark_thread_read(uuid), public.provider_send_message(uuid, text) to authenticated;
commit;
