-- Proposal lifecycle beyond drafts: client share link, acceptance evidence, withdraw, convert.
begin;
alter table public.proposals add column if not exists share_token text unique default encode(extensions.gen_random_bytes(18),'hex');
alter table public.proposals add column if not exists accepted_at timestamptz, add column if not exists acceptance jsonb;
update public.proposals set share_token = encode(extensions.gen_random_bytes(18),'hex') where share_token is null;

-- Client acceptance via share link (anon). Accepts only the latest issued version; records evidence; idempotent.
create or replace function public.accept_proposal(p_token text, p_name text, p_email text, p_version integer)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  if p_token !~ '^[0-9a-f]{36}$' or length(coalesce(p_name,'')) < 2 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into p from public.proposals where share_token = p_token for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if p.status = 'accepted' or p.status = 'converted' then return 'already_accepted'; end if;
  if p.status not in ('sent','viewed') then raise exception 'not_open' using errcode='22023'; end if;
  if p.version <> p_version then raise exception 'version_changed' using errcode='22023'; end if;
  if p.valid_until is not null and p.valid_until < current_date then update public.proposals set status='expired' where id=p.id; return 'expired'; end if;
  update public.proposals set status='accepted', signature_status='signed', accepted_at=now(),
    acceptance = jsonb_build_object('name', left(p_name,120), 'email', lower(left(p_email,200)), 'version', p.version, 'at', now())
  where id = p.id;
  insert into public.audit_events(workspace_id, event, metadata) values (p.workspace_id, 'proposal.accepted', jsonb_build_object('proposal_id', p.id, 'version', p.version, 'email', lower(p_email)));
  return 'accepted';
end; $$;
create or replace function public.mark_proposal_viewed(p_token text) returns void
language sql security definer set search_path = '' as $$
  update public.proposals set status = 'viewed' where share_token = p_token and status = 'sent';
$$;
create or replace function public.withdraw_proposal(p_proposal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if not found or not public.is_workspace_member(p.workspace_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  if p.status not in ('sent','viewed') then raise exception 'invalid_state' using errcode='22023'; end if;
  update public.proposals set status='withdrawn' where id = p.id;
end; $$;
create or replace function public.mark_proposal_converted(p_proposal uuid, p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if not found or not public.is_workspace_member(p.workspace_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  if p.status <> 'accepted' then raise exception 'not_accepted' using errcode='22023'; end if;
  if not exists(select 1 from public.events e where e.id = p_event and e.workspace_id = p.workspace_id) then raise exception 'not_authorized' using errcode='42501'; end if;
  update public.proposals set status='converted', event_id=p_event where id = p.id;
end; $$;
revoke execute on function public.accept_proposal(text,text,text,integer), public.mark_proposal_viewed(text), public.withdraw_proposal(uuid), public.mark_proposal_converted(uuid,uuid) from public, anon, authenticated;
grant execute on function public.accept_proposal(text,text,text,integer), public.mark_proposal_viewed(text) to anon, authenticated;
grant execute on function public.withdraw_proposal(uuid), public.mark_proposal_converted(uuid,uuid) to authenticated;
-- Public read of an issued proposal snapshot by token goes through this function only (no table access for anon).
create or replace function public.proposal_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('number', p.number, 'title', p.title, 'client_name', p.client_name, 'status', p.status, 'version', p.version, 'valid_until', p.valid_until,
    'subtotal', p.subtotal, 'tax', p.tax, 'total', p.total, 'deposit_pct', p.deposit_pct, 'content', v.snapshot->'content', 'workspace', w.name, 'accepted', p.acceptance)
  from public.proposals p join public.workspaces w on w.id = p.workspace_id
  left join public.proposal_versions v on v.proposal_id = p.id and v.version = p.version
  where p.share_token = p_token and p.status in ('sent','viewed','accepted','converted','expired');
$$;
revoke execute on function public.proposal_by_token(text) from public;
grant execute on function public.proposal_by_token(text) to anon, authenticated;
commit;
