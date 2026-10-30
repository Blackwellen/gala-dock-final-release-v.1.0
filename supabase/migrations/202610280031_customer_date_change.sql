-- Consumer date edits must not silently move tickets, holds or provider commitments.
create or replace function public.guard_consumer_event_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if old.management <> 'consumer' or (new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at) then return new; end if;
 if old.status in ('live','completed','closed','cancelled','archived') then raise exception 'event_date_locked' using errcode='22023'; end if;
 if exists(select 1 from public.tickets where event_id=old.id and status in ('valid','resale_listed','used'))
    or exists(select 1 from public.ticket_tiers where event_id=old.id and held>0) then
  raise exception 'ticket_date_commitments' using errcode='22023';
 end if;
 if exists(select 1 from public.build_items where event_id=old.id and status in ('confirmed','held','quoted','available','sent','awaiting','standby')) then
  raise exception 'provider_date_commitments' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists consumer_event_date_guard on public.events;
create trigger consumer_event_date_guard before update of starts_at,ends_at on public.events for each row execute function public.guard_consumer_event_date();

create or replace function public.change_my_event_date(p_event uuid,p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; proposed timestamptz; duration interval; zone text;
begin
 if auth.uid() is null then raise exception 'not_authorized' using errcode='42501'; end if;
 select * into e from public.events where id=p_event and owner_id=auth.uid() and management='consumer' for update;
 if not found then raise exception 'event_not_found' using errcode='42501'; end if;
 zone:=coalesce(nullif(e.timezone,''),'Europe/London');
 if p_date is null or p_date <= (now() at time zone zone)::date then raise exception 'future_date_required' using errcode='22023'; end if;
 proposed:=(p_date + coalesce((e.starts_at at time zone zone)::time,time '18:00')) at time zone zone;
 duration:=case when e.ends_at>e.starts_at then e.ends_at-e.starts_at else interval '7 hours' end;
 update public.events set starts_at=proposed,ends_at=proposed+duration,updated_at=now() where id=e.id;
end $$;
revoke all on function public.guard_consumer_event_date() from public,anon,authenticated;
revoke all on function public.change_my_event_date(uuid,date) from public,anon;
grant execute on function public.change_my_event_date(uuid,date) to authenticated;
