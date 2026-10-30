-- Q08 (lane C) — Versioned, explainable, fraud-resistant reliability score (domain 120). Additive: reliability_metrics,
-- recompute_reliability() and the public reliability_band() are unchanged (marketplace ranking keeps reading them).
--   • reliability_formulas: immutable versions (weights, minimum samples, review smoothing prior). Changing the formula = new version.
--   • reliability_snapshots: every computation keeps its component breakdown (numerator/denominator/value/weight), the formula version
--     and what was excluded, so a score can always be explained and audited.
--   • Inputs are canonical operational records only. Sponsored listings, boosts and ad delivery are NEVER inputs (Q23 rule).
--     Reviews count only when published, tied to a booking, not written by a member of the provider workspace and not under
--     enforcement; ratings are smoothed toward a prior so a handful of reviews cannot swing the score.
--   • trust.reliability_daily (db job, 02:45) snapshots every provider workspace with listings.

create table if not exists public.reliability_formulas (
  version integer primary key check (version > 0),
  weights jsonb not null check (jsonb_typeof(weights) = 'object'),
  min_samples jsonb not null check (jsonb_typeof(min_samples) = 'object'),
  review_prior numeric(3,2) not null default 4.00,
  review_prior_weight integer not null default 5,
  window_days integer not null default 180,
  description text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists reliability_formulas_one_active on public.reliability_formulas((true)) where active;
alter table public.reliability_formulas enable row level security;
revoke all on public.reliability_formulas from anon, authenticated;
grant select on public.reliability_formulas to authenticated;
drop policy if exists reliability_formulas_read on public.reliability_formulas;
create policy reliability_formulas_read on public.reliability_formulas for select to authenticated using (true);
-- Versions are append-only.
create or replace function public.reliability_formulas_immutable() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'formula_versions_are_append_only' using errcode = '42501'; end if;
  if new.weights is distinct from old.weights or new.min_samples is distinct from old.min_samples or new.review_prior is distinct from old.review_prior
     or new.review_prior_weight is distinct from old.review_prior_weight or new.window_days is distinct from old.window_days then
    raise exception 'formula_versions_are_append_only' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists reliability_formulas_immutable on public.reliability_formulas;
create trigger reliability_formulas_immutable before update or delete on public.reliability_formulas for each row execute function public.reliability_formulas_immutable();
revoke all on function public.reliability_formulas_immutable() from public, anon, authenticated;

insert into public.reliability_formulas(version, weights, min_samples, review_prior, review_prior_weight, window_days, description, active) values
  (1, '{"response_rate":0.20,"response_time":0.10,"completion_rate":0.20,"cancellation":0.20,"dispute":0.10,"arrival":0.05,"review_score":0.15}',
      '{"requests":5,"bookings":3,"reviews":3}', 4.00, 5, 180,
      'v1: response rate/time, completion, provider cancellations, customer disputes, on-site arrival and smoothed verified review score over 180 days. Components without enough data are omitted and the remaining weights renormalised.',
      true)
on conflict (version) do nothing;

create table if not exists public.reliability_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  formula_version integer not null references public.reliability_formulas(version),
  score numeric(5,2) check (score is null or score between 0 and 100),
  band text not null check (band in ('new','developing','good','excellent','at_risk')),
  components jsonb not null,
  excluded jsonb not null default '{}',
  computed_at timestamptz not null default now()
);
create index if not exists reliability_snapshots_ws_idx on public.reliability_snapshots(workspace_id, computed_at desc);
alter table public.reliability_snapshots enable row level security;
revoke all on public.reliability_snapshots from anon, authenticated;
grant select on public.reliability_snapshots to authenticated;
drop policy if exists reliability_snapshots_read on public.reliability_snapshots;
create policy reliability_snapshots_read on public.reliability_snapshots for select to authenticated
  using (public.is_workspace_member(workspace_id) or public.has_admin_permission('trust'));

-- Computes and stores one snapshot. Internal (service role / jobs).
create or replace function public.reliability_compute(p_workspace uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare f public.reliability_formulas; m public.reliability_metrics; since timestamptz; comps jsonb := '{}'; wsum numeric := 0; acc numeric := 0;
  rv_n integer; rv_avg numeric; self_n integer; hidden_n integer; arrivals integer; score numeric; band text; sid uuid; wt numeric;
  k text; v numeric; num numeric; den numeric; okc boolean;
begin
  select * into f from public.reliability_formulas where active limit 1;
  since := now() - make_interval(days => f.window_days);
  perform public.recompute_reliability(p_workspace);
  select * into m from public.reliability_metrics where workspace_id = p_workspace;
  -- Fraud-resistant review input.
  select count(*), avg(v.rating) into rv_n, rv_avg from public.reviews v join public.listings l on l.id = v.listing_id
    where l.workspace_id = p_workspace and v.status = 'published' and v.build_item_id is not null and v.created_at > since
      and v.user_id is distinct from (select ow.owner_id from public.workspaces ow where ow.id = p_workspace)
      and not exists (select 1 from public.workspace_members mm where mm.workspace_id = p_workspace and mm.user_id = v.user_id)
      and not exists (select 1 from public.enforcement_actions a where a.subject_type = 'review' and a.subject_id = v.id and a.status = 'active');
  select count(*) into self_n from public.reviews v join public.listings l on l.id = v.listing_id
    where l.workspace_id = p_workspace and v.created_at > since
      and (v.user_id = (select ow.owner_id from public.workspaces ow where ow.id = p_workspace) or exists (select 1 from public.workspace_members mm where mm.workspace_id = p_workspace and mm.user_id = v.user_id));
  select count(*) into hidden_n from public.reviews v join public.listings l on l.id = v.listing_id
    where l.workspace_id = p_workspace and v.created_at > since and (v.status <> 'published' or v.build_item_id is null);
  select count(*) into arrivals from public.audit_events a where a.workspace_id = p_workspace and a.event = 'provider.arrived' and a.created_at > since;

  for k, num, den, okc in select * from (values
      ('response_rate', coalesce(m.requests_responded, 0)::numeric, coalesce(m.requests_received, 0)::numeric, coalesce(m.requests_received, 0) >= (f.min_samples->>'requests')::int),
      ('response_time', coalesce(m.median_response_minutes, 0)::numeric, 1::numeric, m.median_response_minutes is not null and coalesce(m.requests_received, 0) >= (f.min_samples->>'requests')::int),
      ('completion_rate', coalesce(m.bookings_completed, 0)::numeric, coalesce(m.bookings_confirmed, 0)::numeric, coalesce(m.bookings_confirmed, 0) >= (f.min_samples->>'bookings')::int),
      ('cancellation', coalesce(m.provider_cancellations, 0)::numeric, coalesce(m.bookings_confirmed, 0)::numeric, coalesce(m.bookings_confirmed, 0) >= (f.min_samples->>'bookings')::int),
      ('dispute', coalesce(m.disputes, 0)::numeric, coalesce(m.bookings_confirmed, 0)::numeric, coalesce(m.bookings_confirmed, 0) >= (f.min_samples->>'bookings')::int),
      ('arrival', least(arrivals, coalesce(m.bookings_completed, 0))::numeric, coalesce(m.bookings_completed, 0)::numeric, arrivals > 0 and coalesce(m.bookings_completed, 0) >= (f.min_samples->>'bookings')::int),
      ('review_score', coalesce(rv_avg, 0), rv_n::numeric, rv_n >= (f.min_samples->>'reviews')::int)) t(k, num, den, okc) loop
    wt := coalesce((f.weights->>k)::numeric, 0);
    v := case k
      when 'response_rate' then num / greatest(den, 1)
      when 'response_time' then case when num <= 60 then 1 when num <= 240 then 0.8 when num <= 1440 then 0.5 else 0.2 end
      when 'completion_rate' then least(1, num / greatest(den, 1))
      when 'cancellation' then greatest(0, 1 - num / greatest(den, 1))
      when 'dispute' then greatest(0, 1 - num / greatest(den, 1))
      when 'arrival' then least(1, num / greatest(den, 1))
      when 'review_score' then ((f.review_prior * f.review_prior_weight + num * den) / (f.review_prior_weight + den) - 1) / 4
    end;
    comps := comps || jsonb_build_object(k, jsonb_build_object('numerator', num, 'denominator', den, 'value', case when okc then round(v, 4) end,
      'weight', wt, 'included', okc, 'note', case when okc then null else 'not enough data' end));
    if okc then acc := acc + v * wt; wsum := wsum + wt; end if;
  end loop;
  score := case when wsum >= 0.4 then round(100 * acc / wsum, 2) end;     -- need at least 40% of the weight backed by data
  band := case when score is null then 'new' when score >= 85 then 'excellent' when score >= 70 then 'good' when score >= 50 then 'developing' else 'at_risk' end;
  insert into public.reliability_snapshots(workspace_id, formula_version, score, band, components, excluded)
    values (p_workspace, f.version, score, band, comps, jsonb_build_object('sponsored_or_ads', 'never an input', 'self_or_team_reviews', self_n,
      'unpublished_or_unbooked_reviews', hidden_n)) returning id into sid;
  insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', p_workspace, 'reliability.recomputed',
    jsonb_build_object('snapshot_id', sid, 'formula_version', f.version, 'score', score, 'band', band));
  return jsonb_build_object('snapshot_id', sid, 'formula_version', f.version, 'score', score, 'band', band, 'components', comps);
end $$;

-- Member/Trust view of the latest breakdown (explainability). Public surfaces keep using the coarse reliability_band().
create or replace function public.reliability_explain(p_workspace uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_workspace_member(p_workspace) or public.has_admin_permission('trust') then
    (select jsonb_build_object('score', s.score, 'band', s.band, 'formula_version', s.formula_version, 'formula', f.description, 'components', s.components,
       'excluded', s.excluded, 'computed_at', s.computed_at)
     from public.reliability_snapshots s join public.reliability_formulas f on f.version = s.formula_version
     where s.workspace_id = p_workspace order by s.computed_at desc limit 1) end;
$$;

create or replace function public.job_trust_reliability_daily(p_job public.job_queue) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare wr record; n integer := 0;
begin
  for wr in select distinct l.workspace_id from public.listings l join public.workspaces x on x.id = l.workspace_id where x.kind = 'provider' and x.status = 'active' loop
    perform public.reliability_compute(wr.workspace_id); n := n + 1;
  end loop;
  delete from public.reliability_snapshots s where s.computed_at < now() - interval '400 days';
  return jsonb_build_object('workspaces', n);
end $$;

revoke all on function public.reliability_compute(uuid), public.job_trust_reliability_daily(public.job_queue) from public, anon, authenticated;
grant execute on function public.reliability_compute(uuid), public.job_trust_reliability_daily(public.job_queue) to service_role;
revoke all on function public.reliability_explain(uuid) from public, anon;
grant execute on function public.reliability_explain(uuid) to authenticated, service_role;

insert into public.job_kinds(kind, runtime, handler, max_attempts, backoff_seconds, lease_seconds, description) values
  ('trust.reliability_daily', 'db', 'public.job_trust_reliability_daily', 3, '{300,1800,7200}', 600, 'Q08: versioned reliability snapshots for provider workspaces.')
on conflict (kind) do update set runtime = excluded.runtime, handler = excluded.handler, max_attempts = excluded.max_attempts, backoff_seconds = excluded.backoff_seconds,
  lease_seconds = excluded.lease_seconds, description = excluded.description, updated_at = now();
select cron.unschedule(jobid) from cron.job where jobname = 'trust-reliability-daily';
select cron.schedule('trust-reliability-daily', '45 2 * * *', $$select public.enqueue_job('trust.reliability_daily', '{}'::jsonb, 'trust.reliability_daily:' || current_date::text)$$);
