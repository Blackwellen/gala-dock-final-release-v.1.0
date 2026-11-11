-- UK bank holidays for DEC-107 business-day release dates (coordinator 2026-11-11): a ticket release (event end + N business days)
-- never lands early because of a bank holiday. Seeded from https://www.gov.uk/bank-holidays.json (England and Wales, Scotland,
-- Northern Ireland) for 2026–2028 on 2026-11-11. REFRESH YEARLY (launch-ops-checklist §6): gov.uk publishes the next years.
-- Calculation uses England and Wales unless a region is passed. Additive: one table; dec107_add_business_days keeps its signature
-- and now delegates to dec107_add_business_days_in (stable, reads the table).

create table if not exists public.uk_bank_holidays (
  day date not null,
  region text not null check (region in ('england-and-wales','scotland','northern-ireland')),
  title text not null,
  primary key (day, region)
);
alter table public.uk_bank_holidays enable row level security;
drop policy if exists uk_bank_holidays_read on public.uk_bank_holidays;
create policy uk_bank_holidays_read on public.uk_bank_holidays for select to authenticated using (true);
revoke all on public.uk_bank_holidays from anon, authenticated;
grant select on public.uk_bank_holidays to authenticated;

insert into public.uk_bank_holidays(day, region, title) values
  ('2026-01-01', 'england-and-wales', 'New Year’s Day'),
  ('2026-04-03', 'england-and-wales', 'Good Friday'),
  ('2026-04-06', 'england-and-wales', 'Easter Monday'),
  ('2026-05-04', 'england-and-wales', 'Early May bank holiday'),
  ('2026-05-25', 'england-and-wales', 'Spring bank holiday'),
  ('2026-08-31', 'england-and-wales', 'Summer bank holiday'),
  ('2026-12-25', 'england-and-wales', 'Christmas Day'),
  ('2026-12-28', 'england-and-wales', 'Boxing Day'),
  ('2027-01-01', 'england-and-wales', 'New Year’s Day'),
  ('2027-03-26', 'england-and-wales', 'Good Friday'),
  ('2027-03-29', 'england-and-wales', 'Easter Monday'),
  ('2027-05-03', 'england-and-wales', 'Early May bank holiday'),
  ('2027-05-31', 'england-and-wales', 'Spring bank holiday'),
  ('2027-08-30', 'england-and-wales', 'Summer bank holiday'),
  ('2027-12-27', 'england-and-wales', 'Christmas Day'),
  ('2027-12-28', 'england-and-wales', 'Boxing Day'),
  ('2028-01-03', 'england-and-wales', 'New Year’s Day'),
  ('2028-04-14', 'england-and-wales', 'Good Friday'),
  ('2028-04-17', 'england-and-wales', 'Easter Monday'),
  ('2028-05-01', 'england-and-wales', 'Early May bank holiday'),
  ('2028-05-29', 'england-and-wales', 'Spring bank holiday'),
  ('2028-08-28', 'england-and-wales', 'Summer bank holiday'),
  ('2028-12-25', 'england-and-wales', 'Christmas Day'),
  ('2028-12-26', 'england-and-wales', 'Boxing Day'),
  ('2026-01-01', 'scotland', 'New Year’s Day'),
  ('2026-01-02', 'scotland', '2nd January'),
  ('2026-04-03', 'scotland', 'Good Friday'),
  ('2026-05-04', 'scotland', 'Early May bank holiday'),
  ('2026-05-25', 'scotland', 'Spring bank holiday'),
  ('2026-06-15', 'scotland', 'World Cup bank holiday'),
  ('2026-08-03', 'scotland', 'Summer bank holiday'),
  ('2026-11-30', 'scotland', 'St Andrew’s Day'),
  ('2026-12-25', 'scotland', 'Christmas Day'),
  ('2026-12-28', 'scotland', 'Boxing Day'),
  ('2027-01-01', 'scotland', 'New Year’s Day'),
  ('2027-01-04', 'scotland', '2nd January'),
  ('2027-03-26', 'scotland', 'Good Friday'),
  ('2027-05-03', 'scotland', 'Early May bank holiday'),
  ('2027-05-31', 'scotland', 'Spring bank holiday'),
  ('2027-08-02', 'scotland', 'Summer bank holiday'),
  ('2027-11-30', 'scotland', 'St Andrew’s Day'),
  ('2027-12-27', 'scotland', 'Christmas Day'),
  ('2027-12-28', 'scotland', 'Boxing Day'),
  ('2028-01-03', 'scotland', 'New Year’s Day'),
  ('2028-01-04', 'scotland', '2nd January'),
  ('2028-04-14', 'scotland', 'Good Friday'),
  ('2028-05-01', 'scotland', 'Early May bank holiday'),
  ('2028-05-29', 'scotland', 'Spring bank holiday'),
  ('2028-08-07', 'scotland', 'Summer bank holiday'),
  ('2028-11-30', 'scotland', 'St Andrew’s Day'),
  ('2028-12-25', 'scotland', 'Christmas Day'),
  ('2028-12-26', 'scotland', 'Boxing Day'),
  ('2026-01-01', 'northern-ireland', 'New Year’s Day'),
  ('2026-03-17', 'northern-ireland', 'St Patrick’s Day'),
  ('2026-04-03', 'northern-ireland', 'Good Friday'),
  ('2026-04-06', 'northern-ireland', 'Easter Monday'),
  ('2026-05-04', 'northern-ireland', 'Early May bank holiday'),
  ('2026-05-25', 'northern-ireland', 'Spring bank holiday'),
  ('2026-07-13', 'northern-ireland', 'Battle of the Boyne (Orangemen’s Day)'),
  ('2026-08-31', 'northern-ireland', 'Summer bank holiday'),
  ('2026-12-25', 'northern-ireland', 'Christmas Day'),
  ('2026-12-28', 'northern-ireland', 'Boxing Day'),
  ('2027-01-01', 'northern-ireland', 'New Year’s Day'),
  ('2027-03-17', 'northern-ireland', 'St Patrick’s Day'),
  ('2027-03-26', 'northern-ireland', 'Good Friday'),
  ('2027-03-29', 'northern-ireland', 'Easter Monday'),
  ('2027-05-03', 'northern-ireland', 'Early May bank holiday'),
  ('2027-05-31', 'northern-ireland', 'Spring bank holiday'),
  ('2027-07-12', 'northern-ireland', 'Battle of the Boyne (Orangemen’s Day)'),
  ('2027-08-30', 'northern-ireland', 'Summer bank holiday'),
  ('2027-12-27', 'northern-ireland', 'Christmas Day'),
  ('2027-12-28', 'northern-ireland', 'Boxing Day'),
  ('2028-01-03', 'northern-ireland', 'New Year’s Day'),
  ('2028-03-17', 'northern-ireland', 'St Patrick’s Day'),
  ('2028-04-14', 'northern-ireland', 'Good Friday'),
  ('2028-04-17', 'northern-ireland', 'Easter Monday'),
  ('2028-05-01', 'northern-ireland', 'Early May bank holiday'),
  ('2028-05-29', 'northern-ireland', 'Spring bank holiday'),
  ('2028-07-12', 'northern-ireland', 'Battle of the Boyne (Orangemen’s Day)'),
  ('2028-08-28', 'northern-ireland', 'Summer bank holiday'),
  ('2028-12-25', 'northern-ireland', 'Christmas Day'),
  ('2028-12-26', 'northern-ireland', 'Boxing Day')
on conflict (day, region) do update set title = excluded.title;

create or replace function public.dec107_add_business_days_in(p_from timestamptz, p_days integer, p_region text)
returns timestamptz language plpgsql stable security definer set search_path to '' as $$
declare d timestamptz := p_from; n integer := 0; local_day date;
begin
  while n < greatest(p_days, 0) loop
    d := d + interval '1 day';
    local_day := (d at time zone 'Europe/London')::date;
    if extract(isodow from local_day) < 6
       and not exists (select 1 from public.uk_bank_holidays h where h.day = local_day and h.region = coalesce(p_region, 'england-and-wales')) then
      n := n + 1;
    end if;
  end loop;
  return d;
end $$;
revoke all on function public.dec107_add_business_days_in(timestamptz, integer, text) from public, anon, authenticated;

/** UK business days (Mon–Fri, England and Wales bank holidays excluded). Same signature as 202611116010. */
create or replace function public.dec107_add_business_days(p_from timestamptz, p_days integer)
returns timestamptz language sql stable security definer set search_path to '' as $$
  select public.dec107_add_business_days_in(p_from, p_days, 'england-and-wales');
$$;
revoke all on function public.dec107_add_business_days(timestamptz, integer) from public, anon, authenticated;
