-- Exercise for 202610295002 (rolled back). Runs as a platform admin claim? admin_vat_summary checks has_admin_permission, so only the
-- predicate/compile path and the flag are exercised here.
do $$
declare n bigint;
begin
  select count(*) into n from public.platform_charges where livemode;
  if n <> 0 then raise exception 'historic platform_charges must be test'; end if;
  begin perform * from public.admin_vat_summary(current_date - 30, current_date);
  exception when sqlstate '42501' then null; end;
  raise exception 'EXERCISE_OK vat summary mode filter compiled; live platform_charges=%', n;
end $$;
