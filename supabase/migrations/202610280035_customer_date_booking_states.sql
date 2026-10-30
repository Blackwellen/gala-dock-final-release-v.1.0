-- Newly introduced quote, hold, payment, active and disputed states must not
-- escape the date commitment guard. Only explicit uncommitted/closed lines allow edits.
create or replace function public.guard_consumer_event_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if old.management <> 'consumer' or (new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at) then return new;end if;
 if old.status in ('live','completed','closed','cancelled','archived') then raise exception 'event_date_locked' using errcode='22023';end if;
 if exists(select 1 from public.tickets where event_id=old.id and status in ('valid','resale_listed','used')) or exists(select 1 from public.ticket_tiers where event_id=old.id and held>0) then raise exception 'ticket_date_commitments' using errcode='22023';end if;
 if exists(select 1 from public.build_items where event_id=old.id and status not in ('suggested','draft','declined','unavailable','expired','cancelled','cancelled_by_customer','cancelled_by_provider','refunded','expired_no_response')) then raise exception 'provider_date_commitments' using errcode='22023';end if;
 return new;
end $$;
revoke all on function public.guard_consumer_event_date() from public,anon,authenticated;
