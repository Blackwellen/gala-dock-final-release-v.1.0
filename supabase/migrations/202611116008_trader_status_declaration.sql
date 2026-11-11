-- Consumer law (playbook §4; Gigvora pattern): every seller declares whether it sells as a business (trader) or not. The question
-- defaults to "As a business: sole trader, freelancer, partnership or company". The declaration is recorded with version, user
-- and time (append-only; the latest one applies). Consumers see a non-trader warning on non-trader sellers' events and listings
-- (consumer protection law, e.g. the 14-day and quality rights, does not apply to purchases from non-traders).
-- Demo/QA workspaces count as business without a declaration (dec107_gate_exempt). Additive only.

alter table public.dec107_settings add column if not exists trader_declaration_version text not null default 'gd-td-1.0-2026-11-11';

create table if not exists public.seller_trader_declarations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null check (status in ('business','non_trader')),
  business_form text check (business_form is null or business_form in ('sole_trader','freelancer','partnership','company','charity','other_business')),
  version text not null,
  declared_by uuid not null,
  declared_at timestamptz not null default now(),
  constraint seller_trader_form check ((status = 'business') = (business_form is not null))
);
create index if not exists seller_trader_declarations_ws on public.seller_trader_declarations (workspace_id, declared_at desc);
alter table public.seller_trader_declarations enable row level security;
drop policy if exists seller_trader_declarations_read on public.seller_trader_declarations;
create policy seller_trader_declarations_read on public.seller_trader_declarations for select to authenticated
  using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
revoke all on public.seller_trader_declarations from anon, authenticated;
grant select on public.seller_trader_declarations to authenticated;

/** 'business' | 'non_trader' | null (not declared). Demo/QA count as business. */
create or replace function public.seller_trader_status(p_workspace uuid)
returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select d.status from public.seller_trader_declarations d where d.workspace_id = p_workspace order by d.declared_at desc limit 1),
                  case when public.dec107_gate_exempt(p_workspace) then 'business' end);
$$;
revoke all on function public.seller_trader_status(uuid) from public, anon;
grant execute on function public.seller_trader_status(uuid) to authenticated;

create or replace function public.declare_trader_status(p_workspace uuid, p_status text, p_business_form text, p_version text)
returns void language plpgsql security definer set search_path to '' as $$
declare v text;
begin
  if not public.has_workspace_role(p_workspace, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select trader_declaration_version into v from public.dec107_settings where id;
  if p_version is distinct from v then raise exception 'terms_version_changed' using errcode = '22023', hint = v; end if;
  if p_status not in ('business','non_trader') or (p_status = 'business' and p_business_form is null) then raise exception 'invalid_declaration' using errcode = '22023'; end if;
  insert into public.seller_trader_declarations(workspace_id, status, business_form, version, declared_by)
    values (p_workspace, p_status, case when p_status = 'business' then p_business_form end, v, auth.uid());
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', p_workspace, 'trader.declared', jsonb_build_object('status', p_status, 'form', p_business_form, 'version', v));
end $$;
revoke all on function public.declare_trader_status(uuid, text, text, text) from public, anon;
grant execute on function public.declare_trader_status(uuid, text, text, text) to authenticated;

/** Public: true when an event's seller (the organiser workspace) declared it is NOT a trader. Anyone may ask. */
create or replace function public.event_seller_non_trader(p_event uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select public.seller_trader_status(e.workspace_id) = 'non_trader' from public.events e where e.id = p_event), false);
$$;
revoke all on function public.event_seller_non_trader(uuid) from public;
grant execute on function public.event_seller_non_trader(uuid) to anon, authenticated;

create or replace function public.listing_seller_non_trader(p_listing uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((select public.seller_trader_status(l.workspace_id) = 'non_trader' from public.listings l where l.id = p_listing and l.published), false);
$$;
revoke all on function public.listing_seller_non_trader(uuid) from public;
grant execute on function public.listing_seller_non_trader(uuid) to anon, authenticated;
