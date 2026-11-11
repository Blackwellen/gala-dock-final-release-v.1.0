-- Exercise for 202611116006 (rolled back): counts persist, 80 % alerts once, a spent provider is refused.
do $$
declare ok boolean; n integer;
begin
  insert into public.ai_provider_budgets(provider, daily_limit) values ('azure:p1-exercise', 5);
  for i in 1..5 loop ok := public.ai_provider_attempt('azure:p1-exercise'); if not ok then raise exception 'refused early at %', i; end if; end loop;
  if public.ai_provider_attempt('azure:p1-exercise') then raise exception 'spent provider not refused'; end if;
  select count(*) into n from public.audit_events where event = 'ai.provider_budget_alert' and metadata->>'provider' = 'azure:p1-exercise';
  if n <> 1 then raise exception '80%% alert count %', n; end if;
  raise exception 'EXERCISE_OK provider budget';
end $$;
