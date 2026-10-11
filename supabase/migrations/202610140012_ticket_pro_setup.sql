-- W03 (organizer) professional ticket setup: tier artwork, dependent releases and promoter allocations.

alter table public.ticket_tiers add column if not exists image text check (image is null or length(image) <= 400);
alter table public.ticket_tiers add column if not exists after_tier uuid references public.ticket_tiers(id) on delete set null;
alter table public.ticket_tiers drop constraint if exists ticket_tiers_after_self;
alter table public.ticket_tiers add constraint ticket_tiers_after_self check (after_tier is null or after_tier <> id);
create index if not exists ticket_tiers_after_tier_idx on public.ticket_tiers(after_tier) where after_tier is not null;

alter table public.promoters add column if not exists ticket_allocation integer check (ticket_allocation is null or ticket_allocation >= 0);

-- When a tier sells out, mark it sold out and open any scheduled tier that releases "after" it.
create or replace function public.ticket_tier_release_next()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sold >= new.quantity and new.quantity > 0 and old.sold < old.quantity then
    if new.status = 'on_sale' then new.status := 'sold_out'; end if;
  end if;
  return new;
end $$;

create or replace function public.ticket_tier_open_dependants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sold_out' and old.status is distinct from 'sold_out' then
    update public.ticket_tiers set status = 'on_sale'
     where after_tier = new.id and event_id = new.event_id and status = 'scheduled';
  end if;
  return null;
end $$;

drop trigger if exists ticket_tier_release_next on public.ticket_tiers;
create trigger ticket_tier_release_next before update of sold on public.ticket_tiers
  for each row execute function public.ticket_tier_release_next();
drop trigger if exists ticket_tier_open_dependants on public.ticket_tiers;
-- Not "update of status": the status may be set by the BEFORE trigger above, which a column list would miss.
create trigger ticket_tier_open_dependants after update on public.ticket_tiers
  for each row when (new.status = 'sold_out' and old.status is distinct from 'sold_out')
  execute function public.ticket_tier_open_dependants();

revoke execute on function public.ticket_tier_release_next() from public, anon, authenticated;
revoke execute on function public.ticket_tier_open_dependants() from public, anon, authenticated;
