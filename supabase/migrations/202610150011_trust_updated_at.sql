-- trust_cases.updated_at (added in 202610150010) must reflect real activity:
--   * rows inserted without an explicit value take their latest known activity (decision or creation), not the insert time;
--   * every later update bumps it; pre-existing rows are backfilled the same way.
begin;
create or replace function public.trust_cases_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.updated_at is null or new.updated_at = now() then new.updated_at := greatest(new.created_at, coalesce(new.decided_at, new.created_at)); end if;
  elsif new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trust_cases_touch on public.trust_cases;
create trigger trust_cases_touch before insert or update on public.trust_cases for each row execute function public.trust_cases_touch();
revoke all on function public.trust_cases_touch() from public, anon;
-- Backfill rows that predate the column (no Admin-B metadata recorded yet).
alter table public.trust_cases disable trigger trust_cases_touch;
update public.trust_cases set updated_at = greatest(created_at, coalesce(decided_at, created_at)) where not (related ? 'stage');
alter table public.trust_cases enable trigger trust_cases_touch;
commit;
