-- Exercise for 202611146501 (always rolled back): FIFO credit expiry, credit-pack refund reversal (idempotent, cumulative),
-- purchase lot keeps its payment intent, and the new functions are service-only.
do $$
declare ws uuid; pk public.credit_packs; b numeric; r jsonb; st jsonb;
begin
  select id into ws from public.workspaces where kind = 'organizer' order by created_at limit 1;
  select * into pk from public.credit_packs where 'organizer' = any (workspace_kinds) order by price_minor limit 1;
  if ws is null or pk.id is null then raise exception 'fixtures missing'; end if;
  if has_function_privilege('authenticated', 'public.billing_credit_pack_refunded(jsonb, boolean)', 'execute') then raise exception 'refund fn must be service-only'; end if;
  if has_function_privilege('anon', 'public.ai_credit_balance(uuid, timestamptz)', 'execute') then raise exception 'balance fn must be service-only'; end if;
  delete from public.ai_credit_ledger where workspace_id = ws;

  -- A: 500 expiring in 30 days ago-window, 400 used before it expired, then it expired; B: 500 bought later → balance 500 (was 100).
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, expires_at, created_at) values
    (ws, 'grant', 500, 'A', now() - interval '10 days', now() - interval '60 days'),
    (ws, 'usage', -400, 'use A', null, now() - interval '50 days'),
    (ws, 'grant', 500, 'B', now() + interval '300 days', now() - interval '5 days');
  b := public.ai_credit_balance(ws); if b <> 500 then raise exception 'FIFO expiry: expected 500, got %', b; end if;
  st := public.ai_credit_status(ws); if (st ->> 'balance')::numeric <> 500 then raise exception 'status balance expected 500, got %', st ->> 'balance'; end if;
  -- Earliest-expiring valid lot is consumed first: C never expires, use 300 now → comes out of B.
  insert into public.ai_credit_ledger(workspace_id, kind, credits, reference, expires_at, created_at) values
    (ws, 'grant', 200, 'C', null, now() - interval '4 days'), (ws, 'usage', -300, 'use', null, now() - interval '3 days');
  b := public.ai_credit_balance(ws); if b <> 400 then raise exception 'expected 400, got %', b; end if;
  b := public.ai_credit_balance(ws, now() + interval '400 days'); if b <> 200 then raise exception 'after B expires expected 200 (C), got %', b; end if;

  -- Credit pack paid → lot remembers the payment intent; refunds reverse the refunded share once.
  delete from public.ai_credit_ledger where workspace_id = ws;
  r := public.billing_credit_pack_paid(jsonb_build_object('id', 'cs_test_q60x', 'payment_status', 'paid', 'payment_intent', 'pi_test_q60x', 'currency', pk.currency,
         'amount_subtotal', pk.price_minor, 'metadata', jsonb_build_object('purpose', 'ai_credits', 'workspace_id', ws, 'pack_id', pk.id)), false);
  if not (r ->> 'credited')::boolean then raise exception 'pack not credited: %', r; end if;
  if not exists (select 1 from public.ai_credit_ledger where workspace_id = ws and kind = 'purchase' and stripe_payment_intent = 'pi_test_q60x') then raise exception 'pi not stored'; end if;
  r := public.billing_credit_pack_refunded(jsonb_build_object('id', 'ch_q60', 'payment_intent', 'pi_test_q60x', 'amount', pk.price_minor, 'amount_refunded', pk.price_minor / 2), false);
  if (r ->> 'reversed')::numeric <> round(pk.credits * (pk.price_minor / 2) / pk.price_minor, 3) then raise exception 'half refund wrong: %', r; end if;
  r := public.billing_credit_pack_refunded(jsonb_build_object('id', 'ch_q60', 'payment_intent', 'pi_test_q60x', 'amount', pk.price_minor, 'amount_refunded', pk.price_minor / 2), false);
  if (r ->> 'reversed')::numeric <> 0 then raise exception 'replay must be a no-op: %', r; end if;
  r := public.billing_credit_pack_refunded(jsonb_build_object('id', 'ch_q60', 'payment_intent', 'pi_test_q60x', 'amount', pk.price_minor, 'amount_refunded', pk.price_minor), false);
  b := public.ai_credit_balance(ws); if b <> 0 then raise exception 'full refund must leave 0, got %', b; end if;
  r := public.billing_credit_pack_refunded(jsonb_build_object('id', 'ch_other', 'payment_intent', 'pi_test_notpack', 'amount', 100, 'amount_refunded', 100), false);
  if (r ->> 'credit_pack')::boolean then raise exception 'unknown pi must not be a pack'; end if;
  if (select count(*) from public.audit_events where workspace_id = ws and event = 'billing.credit_pack_refunded' and metadata ->> 'payment_intent' = 'pi_test_q60x') <> 2 then raise exception 'audit rows missing'; end if;
  raise exception 'EXERCISE_OK billing bughunt';
end $$;
