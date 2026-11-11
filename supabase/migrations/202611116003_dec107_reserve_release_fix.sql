-- DEC-107 fix found by the sandbox proof (2026-11-11): paying out a reserve part wiped its reserve fields, so
-- payout_releases_reserve_part refused the update and the reserve could never be recorded as released. Same function, reserve
-- parts keep their own reserve kind/bps/amount/until/terms version.
create or replace function public.dec107_release_paid(p_items jsonb, p_payout text, p_group text)
returns integer language plpgsql security definer set search_path to '' as $$
declare it jsonb; pr public.payout_releases; n integer := 0; s public.dec107_settings;
begin
  select * into s from public.dec107_settings where id;
  if p_payout !~ '^po_[A-Za-z0-9_]+$' then raise exception 'invalid_payout' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from public.payout_releases where id = (it->>'id')::uuid for update;
    if not found or pr.status <> 'due' then continue; end if;
    if public.dec107_payouts_paused(pr.workspace_id) then raise exception 'payouts_paused' using errcode = '22023'; end if;
    -- A reserve part keeps its own reserve fields (202611116003: the sandbox proof found they were wiped → check violation).
    update public.payout_releases set status = 'paid_out', amount_minor = (it->>'amount_minor')::bigint, stripe_payout_id = p_payout, payout_group = p_group,
      released_at = now(),
      reserve_kind = case when pr.part = 'reserve' then pr.reserve_kind else nullif(it->>'reserve_kind', '') end,
      reserve_bps = case when pr.part = 'reserve' then pr.reserve_bps else nullif(it->>'reserve_bps', '')::integer end,
      reserve_minor = case when pr.part = 'reserve' then pr.reserve_minor else nullif(it->>'reserve_minor', '')::bigint end,
      reserve_until = case when pr.part = 'reserve' then pr.reserve_until
                           when coalesce((it->>'reserve_minor')::bigint, 0) > 0 then least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at) end,
      terms_version = case when pr.part = 'reserve' then pr.terms_version when coalesce((it->>'reserve_minor')::bigint, 0) > 0 then s.payment_terms_version end,
      error = null, updated_at = now()
     where id = pr.id;
    if pr.part = 'main' and coalesce((it->>'reserve_minor')::bigint, 0) > 0 then
      insert into public.payout_releases(source_type, source_ref, part, workspace_id, stripe_account_id, payment_intent, event_id, sale_kind, currency, livemode,
          charged_at, hold_limit_at, trigger_at, trigger, reserve_kind, reserve_bps, reserve_minor, reserve_until, terms_version)
        values (pr.source_type, pr.source_ref, 'reserve', pr.workspace_id, pr.stripe_account_id, pr.payment_intent, pr.event_id, pr.sale_kind, pr.currency, pr.livemode,
          pr.charged_at, pr.hold_limit_at, least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), 'reserve_end',
          it->>'reserve_kind', (it->>'reserve_bps')::integer, (it->>'reserve_minor')::bigint,
          least(now() + make_interval(days => coalesce(nullif(it->>'reserve_days', '')::integer, s.reserve_standard_days)), pr.hold_limit_at), s.payment_terms_version)
        on conflict (source_type, source_ref, part) do nothing;
    end if;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', pr.workspace_id, 'payout.released',
      jsonb_build_object('release', pr.id, 'source', pr.source_type || ':' || pr.source_ref, 'event_id', pr.event_id, 'trigger', pr.trigger, 'payout', p_payout,
        'amount_minor', (it->>'amount_minor')::bigint, 'reserve_minor', (it->>'reserve_minor')::bigint));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.dec107_release_paid(jsonb, text, text) from public, anon, authenticated;
