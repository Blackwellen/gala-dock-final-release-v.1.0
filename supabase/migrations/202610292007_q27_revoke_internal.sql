-- Q31/Q27 hardening: trigger and worker functions from 202610292002–2005 are never callable by client roles
-- (triggers fire without an EXECUTE check; workers run as service_role). Listed in tests/release/tenant-security.spec.ts SERVICE_ONLY.
do $$
declare f text;
begin
  foreach f in array array[
    'public.trg_ledger_commission_families()', 'public.trg_promoter_rule_version()', 'public.trg_partner_rule_version()',
    'public.trg_promoter_sale_snapshot()', 'public.trg_promoter_sale_accrued()', 'public.trg_promoter_refund_reversal()',
    'public.trg_promoter_dispute_reversal()', 'public.trg_promoter_sale_lock()', 'public.trg_promoter_payout_conserved()',
    'public.trg_partner_workspace_referral()', 'public.trg_partner_earning_snapshot()', 'public.trg_partner_earning_ledger()',
    'public.trg_partner_invoice()', 'public.trg_maintenance_payment_orders()',
    'public.maintenance_audiences(uuid)', 'public.promoter_post_memo(uuid, text)', 'public.promoter_reverse_order(text, text)',
    'public.partner_link_referral(uuid, uuid)', 'public.partner_post_memo(uuid, text)', 'public.partner_statement_recompute(uuid)',
    'public.partner_qualify_invoice(text)', 'public.partner_reverse_earning(uuid, text)', 'public.partner_build_statements(date)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
