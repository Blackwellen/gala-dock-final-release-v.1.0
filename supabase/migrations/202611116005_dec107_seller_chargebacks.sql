-- DEC-107: sellers handle chargebacks on their own direct charges (they are the merchant). Sellers' owners, managers and
-- finance members can read their account's card disputes and record evidence submissions (the API route submits the evidence to
-- Stripe on the seller's connected account; files are private uploads that must have passed the AV scan).
-- Additive: one read policy, one table.
drop policy if exists stripe_disputes_seller_read on public.stripe_disputes;
create policy stripe_disputes_seller_read on public.stripe_disputes for select to authenticated using (
  exists (select 1 from public.connect_accounts ca where ca.stripe_account_id = stripe_disputes.stripe_account_id
           and public.has_workspace_role(ca.workspace_id, array['owner','manager','finance'])));

create table if not exists public.chargeback_evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  stripe_dispute_id text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid not null,
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  files jsonb not null default '[]',
  final boolean not null default false,
  stripe_status text,
  created_at timestamptz not null default now()
);
alter table public.chargeback_evidence_submissions enable row level security;
drop policy if exists chargeback_evidence_read on public.chargeback_evidence_submissions;
create policy chargeback_evidence_read on public.chargeback_evidence_submissions for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','manager','finance']) or public.has_admin_permission('commerce') or public.has_admin_permission('support'));
revoke all on public.chargeback_evidence_submissions from anon, authenticated;
grant select on public.chargeback_evidence_submissions to authenticated;
