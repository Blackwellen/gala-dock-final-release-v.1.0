-- Dry-run exercise for 202610293036 (always rolled back by migrate.mjs). Three live events with paid on-sale stock and no one waiting,
-- all sellers currently not ready (live: 0 ready sellers):
--   A  seller not ready, paid tier             → waiter stays 'waiting', no notification, stock not held
--   B  seller made ready inside this transaction (connect_accounts row as the Stripe webhook would write it) → offered + notified + held
--   C  seller not ready but every tier made free inside this transaction → offered (checkout accepts free orders without Stripe)
-- Plus: anon and authenticated (client role) still cannot execute notify_waitlists (cron / service only).
create temp table _ex(k text, v text) on commit drop;

do $$
declare a uuid; b uuid; c uuid; ta uuid; tb uuid; tc uuid; u uuid; wa uuid; wb uuid; wc uuid; s text; held_a int; held_b int; n int; msg text;
begin
  select id into u from auth.users where email = 'admin.demo@example.com';
  if u is null then select id into u from auth.users order by created_at limit 1; end if;
  -- Candidates: distinct seller workspaces without a connect_accounts row; tier with free stock; nobody waiting on the event.
  with cand as (
    select distinct on (public.event_seller_workspace(e.id)) e.id ev, t.id tier, public.event_seller_workspace(e.id) sw
    from public.events e join public.ticket_tiers t on t.event_id = e.id
    where e.status not in ('cancelled','postponed') and t.status = 'on_sale' and t.price > 0 and t.quantity - t.sold - t.held > 0
      and (t.sale_end is null or t.sale_end > now()) and public.event_payment_readiness(e.id) <> 'ready'
      and public.event_seller_workspace(e.id) is not null
      and not exists (select 1 from public.connect_accounts ca where ca.workspace_id = public.event_seller_workspace(e.id))
      and not exists (select 1 from public.ticket_waitlist w where w.event_id = e.id and w.status in ('waiting','offered'))
    order by public.event_seller_workspace(e.id), e.id)
  select (array_agg(ev order by ev))[1], (array_agg(ev order by ev))[2], (array_agg(ev order by ev))[3],
         (array_agg(tier order by ev))[1], (array_agg(tier order by ev))[2], (array_agg(tier order by ev))[3] into a, b, c, ta, tb, tc from cand;
  if c is null then raise exception 'exercise: need three candidate events with distinct not-ready sellers'; end if;

  -- B: seller becomes ready. C: all tiers free.
  insert into public.connect_accounts(workspace_id, stripe_account_id, account_type, charges_enabled, payouts_enabled, details_submitted, card_payments_capability, transfers_capability, verification_state)
    values (public.event_seller_workspace(b), 'acct_test_ex3036' || substr(md5(random()::text), 1, 8), 'standard', true, true, true, 'active', 'active', 'verified');
  if public.event_payment_readiness(b) <> 'ready' then raise exception 'exercise: B not ready after connect row'; end if;
  update public.ticket_tiers set price = 0 where event_id = c;

  insert into public.ticket_waitlist(event_id, tier_id, user_id, quantity) values (a, ta, u, 1) returning id into wa;
  insert into public.ticket_waitlist(event_id, tier_id, user_id, quantity) values (b, tb, u, 1) returning id into wb;
  insert into public.ticket_waitlist(event_id, tier_id, user_id, quantity) values (c, tc, u, 1) returning id into wc;
  select held into held_a from public.ticket_tiers where id = ta;
  select held into held_b from public.ticket_tiers where id = tb;

  perform public.notify_waitlists();

  select status into s from public.ticket_waitlist where id = wa;
  if s <> 'waiting' then raise exception 'A (seller not ready, paid) was %', s; end if;
  if exists (select 1 from public.notifications where user_id = u and kind = 'ticket_waitlist' and link like '%waitlist_offer=' || wa) then raise exception 'A notified'; end if;
  if (select held from public.ticket_tiers where id = ta) <> held_a then raise exception 'A stock held'; end if;
  select status into s from public.ticket_waitlist where id = wb;
  if s <> 'offered' then raise exception 'B (seller ready) was %', s; end if;
  if not exists (select 1 from public.notifications where user_id = u and kind = 'ticket_waitlist' and link like '%waitlist_offer=' || wb) then raise exception 'B not notified'; end if;
  if (select held from public.ticket_tiers where id = tb) <> held_b + 1 then raise exception 'B stock not held'; end if;
  select status into s from public.ticket_waitlist where id = wc;
  if s <> 'offered' then raise exception 'C (free only, seller not ready) was %', s; end if;
  insert into _ex values ('not_ready_paid', 'waiting, no notification, no hold'), ('ready_paid', 'offered, notified, held +1'), ('not_ready_free_only', 'offered');

  -- Second run is idempotent for A (still waiting) and leaves B's single offer in place.
  perform public.notify_waitlists();
  select count(*) into n from public.ticket_waitlist where id in (wa, wb) and status = case when id = wa then 'waiting' else 'offered' end;
  if n <> 2 then raise exception 'second run changed A/B'; end if;

  -- Client roles still cannot call it.
  set local role anon;
  begin perform public.notify_waitlists(); msg := 'ran'; exception when insufficient_privilege then msg := 'refused'; end;
  reset role;
  if msg <> 'refused' then raise exception 'anon could run notify_waitlists'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.notify_waitlists(); msg := 'ran'; exception when insufficient_privilege then msg := 'refused'; end;
  reset role;
  if msg <> 'refused' then raise exception 'authenticated could run notify_waitlists'; end if;
  insert into _ex values ('anon', 'refused'), ('authenticated', 'refused');
end $$;

do $$ begin raise exception 'EXERCISE_OK %', (select string_agg(k || '=' || v, '; ' order by k) from _ex); end $$;
