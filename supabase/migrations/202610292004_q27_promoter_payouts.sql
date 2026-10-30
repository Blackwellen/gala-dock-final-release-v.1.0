-- Q27 promoters (part 2): approval and locked payout runs.
-- Sale lifecycle: pending (accrued) → approved (organiser confirms) → held (locked into a payout) → payable (payout approved)
-- → paid (organiser records the off-platform settlement). A payout only ever contains the promoter's APPROVED, unlocked sales,
-- minus pending clawbacks; its amount can never exceed what it locks. Locked sales are immutable (amount, commission, rule,
-- promoter, payout link) except through the payout functions below. No money moves through Gala Dock: the organiser pays its
-- promoter directly, and "paid" is a recorded statement of that settlement (ledger basis seller_obligation_memo).

alter table public.promoter_payouts
  add column if not exists gross_commission numeric(12,2),
  add column if not exists clawback_deducted numeric(12,2) not null default 0 check (clawback_deducted >= 0),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists settlement_method text check (settlement_method is null or settlement_method in ('bank_transfer','paypal','stripe_direct','cash','other')),
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now();
alter table public.promoter_payouts drop constraint promoter_payouts_status_check;
alter table public.promoter_payouts add constraint promoter_payouts_status_check check (status = any (array['scheduled','processing','paid','failed','on_hold','held','payable']));
alter table public.promoter_payouts drop constraint if exists promoter_payouts_locked_amount;
alter table public.promoter_payouts add constraint promoter_payouts_locked_amount
  check (locked_at is null or (gross_commission is not null and amount = gross_commission - clawback_deducted and amount >= 0));

-- promoter_sales.payout_id existed without a foreign key; the 21 existing links all reference one seeded payout whose amount equals
-- their commission (checked 2026-10-29), so the FK validates without touching data.
alter table public.promoter_sales drop constraint if exists promoter_sales_payout_fk;
alter table public.promoter_sales add constraint promoter_sales_payout_fk foreign key (payout_id) references public.promoter_payouts(id) on delete restrict;
alter table public.promoter_sales drop constraint if exists promoter_sales_clawback_payout_fk;
alter table public.promoter_sales add constraint promoter_sales_clawback_payout_fk foreign key (clawback_payout_id) references public.promoter_payouts(id) on delete restrict;

-- Locked rows are immutable outside the payout functions (which set gd.promoter_payout for their transaction).
create or replace function public.trg_promoter_sale_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare in_payout boolean := coalesce(current_setting('gd.promoter_payout', true), '') = 'on';
begin
  if old.payout_id is not null or old.status in ('held','payable','paid') and old.payout_id is not null then
    if new.promoter_id <> old.promoter_id or new.event_id <> old.event_id or new.amount <> old.amount or new.commission <> old.commission
       or new.quantity <> old.quantity or new.commission_rule_id is distinct from old.commission_rule_id or new.order_ref is distinct from old.order_ref then
      raise exception 'promoter_sale_locked' using errcode = '55000';
    end if;
    if not in_payout and (new.status <> old.status or new.payout_id is distinct from old.payout_id) then
      raise exception 'promoter_sale_locked' using errcode = '55000';
    end if;
  end if;
  if old.status = 'reversed' and new.status <> 'reversed' then raise exception 'promoter_sale_reversed' using errcode = '55000'; end if;
  if not in_payout and old.status <> new.status and not (old.status = 'pending' and new.status in ('approved','reversed')) and not (old.status = 'approved' and new.status = 'reversed') then
    raise exception 'promoter_sale_transition: % → %', old.status, new.status using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists promoter_sale_lock on public.promoter_sales;
create trigger promoter_sale_lock before update on public.promoter_sales for each row execute function public.trg_promoter_sale_lock();

-- A locked payout always equals the sum of the sales it locks minus the clawbacks netted into it (checked at commit).
create or replace function public.trg_promoter_payout_conserved()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.promoter_payouts; gross numeric; claw numeric;
begin
  select * into p from public.promoter_payouts where id = coalesce(new.id, old.id);
  if p.id is null or p.locked_at is null or p.status = 'failed' then return null; end if;
  select coalesce(sum(commission), 0) into gross from public.promoter_sales where payout_id = p.id;
  select coalesce(sum(commission), 0) into claw from public.promoter_sales where clawback_payout_id = p.id;
  if gross <> p.gross_commission or claw <> p.clawback_deducted or p.amount > gross then
    raise exception 'promoter_payout_not_conserved (gross % vs %, clawback % vs %)', gross, p.gross_commission, claw, p.clawback_deducted using errcode = '23514';
  end if;
  return null;
end $$;
drop trigger if exists promoter_payout_conserved on public.promoter_payouts;
create constraint trigger promoter_payout_conserved after insert or update on public.promoter_payouts deferrable initially deferred
  for each row execute function public.trg_promoter_payout_conserved();

-- Organiser approves accrued sales (only sales whose order is still issued).
create or replace function public.promoter_approve_sales(p_promoter uuid, p_sales uuid[] default null, p_note text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.can_manage_promoter(p_promoter) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  update public.promoter_sales s set status = 'approved', approved_at = now(), approved_by = auth.uid()
   where s.promoter_id = p_promoter and s.status = 'pending' and (p_sales is null or s.id = any(p_sales))
     and (s.order_ref is null or exists (select 1 from public.checkout_orders o where o.order_ref = s.order_ref and o.status = 'issued' and coalesce(o.refund_status, 'none') in ('none','not_required')));
  get diagnostics n = row_count;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'promoter.sales_approved', jsonb_build_object('promoter_id', p_promoter, 'count', n, 'note', left(coalesce(p_note, ''), 300)));
  return n;
end $$;
revoke all on function public.promoter_approve_sales(uuid, uuid[], text) from public, anon;
grant execute on function public.promoter_approve_sales(uuid, uuid[], text) to authenticated;

-- Locks the promoter's approved balance into a new payout (status held). Pending clawbacks are netted, whole sales only, up to the
-- locked gross; the rest carry forward. Concurrency: the promoter row is locked, so two runs cannot lock the same sales.
create or replace function public.promoter_create_payout(p_promoter uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid; gross numeric := 0; claw numeric := 0; c record;
begin
  if not public.can_manage_promoter(p_promoter) then raise exception 'not_authorized' using errcode = '42501'; end if;
  perform public.require_step_up(null);
  perform 1 from public.promoters where id = p_promoter for update;
  select coalesce(sum(commission), 0) into gross from public.promoter_sales where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  if gross <= 0 then raise exception 'nothing_to_pay' using errcode = 'P0002'; end if;
  perform set_config('gd.promoter_payout', 'on', true);
  insert into public.promoter_payouts(promoter_id, amount, status, scheduled_for, gross_commission, clawback_deducted, locked_at, locked_by, reference)
    values (p_promoter, gross, 'held', current_date, gross, 0, now(), auth.uid(), nullif(left(coalesce(p_note, ''), 120), '')) returning id into v;
  update public.promoter_sales set payout_id = v, status = 'held' where promoter_id = p_promoter and status = 'approved' and payout_id is null and not clawback_pending;
  -- Sales accrued before Q27 get their accrual memo now (idempotent), so the settlement memo always discharges a recorded obligation.
  perform public.promoter_post_memo(s.id, 'accrual') from public.promoter_sales s where s.payout_id = v;
  for c in select id, commission from public.promoter_sales where promoter_id = p_promoter and clawback_pending and clawback_payout_id is null order by reversed_at, id loop
    exit when claw + c.commission > gross;
    update public.promoter_sales set clawback_payout_id = v where id = c.id;
    claw := claw + c.commission;
  end loop;
  update public.promoter_payouts set clawback_deducted = claw, amount = gross - claw where id = v;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'promoter.payout_locked',
    jsonb_build_object('payout_id', v, 'promoter_id', p_promoter, 'gross', gross, 'clawback', claw, 'amount', gross - claw));
  return jsonb_build_object('payout_id', v, 'gross', gross, 'clawback', claw, 'amount', gross - claw);
end $$;
revoke all on function public.promoter_create_payout(uuid, text) from public, anon;
grant execute on function public.promoter_create_payout(uuid, text) to authenticated;

create or replace function public.promoter_payout_transition(p_payout uuid, p_action text, p_reference text default null, p_method text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.promoter_payouts; e record; c bigint;
begin
  select * into p from public.promoter_payouts where id = p_payout for update;
  if p.id is null or not public.can_manage_promoter(p.promoter_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p.locked_at is null then raise exception 'legacy_payout' using errcode = '55000'; end if;
  perform public.require_step_up(null);
  perform set_config('gd.promoter_payout', 'on', true);
  if p_action = 'approve' and p.status = 'held' then
    update public.promoter_payouts set status = 'payable', approved_at = now(), approved_by = auth.uid(), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'payable' where payout_id = p.id;
  elsif p_action = 'mark_paid' and p.status = 'payable' then
    if length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'reference_required' using errcode = '22023'; end if;
    update public.promoter_payouts set status = 'paid', paid_at = now(), reference = left(p_reference, 120), settlement_method = coalesce(p_method, 'bank_transfer'), updated_at = now() where id = p.id;
    update public.promoter_sales set status = 'paid' where payout_id = p.id;
    update public.promoter_sales set clawback_pending = false where clawback_payout_id = p.id;
    c := round(p.amount * 100);
    if c > 0 then
      select ev.workspace_id, ev.owner_id, upper(coalesce(ev.currency, 'GBP')) currency, ev.id into e
        from public.promoters pr join public.events ev on ev.id = pr.event_id where pr.id = p.promoter_id;
      -- Statement of the organiser's off-platform settlement: the promoter obligation is discharged; no Gala Dock account moves.
      perform public.post_memo_ledger_transaction('promoter:payout:' || p.id || ':paid', 'promoter_commission', e.currency,
        jsonb_build_array(
          jsonb_build_object('account', 'promoter_payable', 'party_type', 'promoter', 'party_id', p.promoter_id, 'amount_minor', c),
          jsonb_build_object('account', 'seller_promoter_settled', 'party_type', case when e.workspace_id is null then 'user' else 'workspace' end, 'party_id', coalesce(e.workspace_id, e.owner_id), 'amount_minor', -c)),
        'seller_obligation_memo', e.workspace_id, e.id, 'promoter_payout', p.id::text, 'Promoter commission settled by the organiser off-platform (memo)', null, 'user');
    end if;
  elsif p_action = 'fail' and p.status in ('held','payable') then
    update public.promoter_sales set status = 'approved', payout_id = null where payout_id = p.id;
    update public.promoter_sales set clawback_payout_id = null where clawback_payout_id = p.id;
    update public.promoter_payouts set status = 'failed', failure_reason = left(coalesce(p_reference, ''), 300), updated_at = now() where id = p.id;
  else
    raise exception 'invalid_transition: % from %', p_action, p.status using errcode = '55000';
  end if;
  perform set_config('gd.promoter_payout', '', true);
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'promoter.payout_' || p_action,
    jsonb_build_object('payout_id', p.id, 'promoter_id', p.promoter_id, 'amount', p.amount, 'reference', left(coalesce(p_reference, ''), 120)));
  return (select status from public.promoter_payouts where id = p.id);
end $$;
revoke all on function public.promoter_payout_transition(uuid, text, text, text) from public, anon;
grant execute on function public.promoter_payout_transition(uuid, text, text, text) to authenticated;

-- Statement for one promoter (portal + organiser): accrued, reversed, approved, locked, paid, clawbacks outstanding.
create or replace function public.promoter_statement(p_promoter uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.owns_promoter(p_promoter) or public.can_manage_promoter(p_promoter)) then raise exception 'not_authorized' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'pending', coalesce(sum(commission) filter (where status = 'pending'), 0),
    'approved', coalesce(sum(commission) filter (where status = 'approved' and payout_id is null), 0),
    'held', coalesce(sum(commission) filter (where status = 'held'), 0),
    'payable', coalesce(sum(commission) filter (where status = 'payable'), 0),
    'paid', coalesce(sum(commission) filter (where status = 'paid'), 0),
    'reversed', coalesce(sum(commission) filter (where status = 'reversed'), 0),
    'clawback_outstanding', coalesce(sum(commission) filter (where clawback_pending and clawback_payout_id is null), 0),
    'settles', 'off_platform_by_organiser')
    from public.promoter_sales where promoter_id = p_promoter);
end $$;
revoke all on function public.promoter_statement(uuid) from public, anon;
grant execute on function public.promoter_statement(uuid) to authenticated;
