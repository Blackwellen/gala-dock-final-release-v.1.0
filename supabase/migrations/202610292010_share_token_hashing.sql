-- Q16 P3: proposal / contract share links.
--  1. Tokens were only stored in plain text. Add share_token_hash (sha256 hex), kept in sync by trigger, backfilled, and make every
--     public lookup go by hash with a plaintext fallback during the transition (rows the backfill cannot touch — signed contracts are
--     immutable — and any row written before the trigger existed). Plaintext stays for now so organisers can still copy existing links;
--     dropping it is a later, separate step once links are shown once at issue.
--  2. Expiry / revocation beyond status: share_expires_at, share_revoked_at, and owner commands proposal_share_revoke /
--     contract_share_revoke. A changed token (contract re-send, proposal reissue) clears both.
--  3. mark_proposal_viewed is no longer callable by anon/authenticated: the public page no longer marks "viewed" on server render
--     (link-preview bots); a post-load beacon from the page calls it through the service role after a bot user-agent check.
-- Additive and backward-compatible: same function signatures, return shapes and grants for the anon-callable proposal functions.

alter table public.proposals add column if not exists share_token_hash text, add column if not exists share_expires_at timestamptz, add column if not exists share_revoked_at timestamptz;
alter table public.contracts add column if not exists share_token_hash text, add column if not exists share_expires_at timestamptz, add column if not exists share_revoked_at timestamptz;
create unique index if not exists proposals_share_token_hash_key on public.proposals(share_token_hash) where share_token_hash is not null;
create unique index if not exists contracts_share_token_hash_key on public.contracts(share_token_hash) where share_token_hash is not null;

create or replace function public.share_token_digest(p_token text) returns text
language sql immutable set search_path = '' as $$
  select case when p_token is null or p_token = '' then null else encode(sha256(convert_to(p_token, 'UTF8')), 'hex') end;
$$;

create or replace function public.trg_share_token_hash() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- inlined (not via share_token_digest) so the trigger needs no extra grant for the invoking role
  new.share_token_hash := case when new.share_token is null or new.share_token = '' then null else encode(sha256(convert_to(new.share_token, 'UTF8')), 'hex') end;
  if tg_op = 'UPDATE' and new.share_token is distinct from old.share_token then
    new.share_revoked_at := null; new.share_expires_at := null;
  end if;
  return new;
end $$;

drop trigger if exists proposals_share_token_hash on public.proposals;
create trigger proposals_share_token_hash before insert or update on public.proposals for each row execute function public.trg_share_token_hash();
drop trigger if exists contracts_share_token_hash on public.contracts;
create trigger contracts_share_token_hash before insert or update on public.contracts for each row execute function public.trg_share_token_hash();

-- Backfill (signed contracts are immutable and keep the plaintext fallback).
update public.proposals set share_token_hash = public.share_token_digest(share_token) where share_token is not null and share_token_hash is null;
update public.contracts set share_token_hash = public.share_token_digest(share_token) where share_token is not null and share_token_hash is null and status <> 'signed';

-- Live-link resolvers: hash first, plaintext fallback only for rows without a hash; revoked / expired links never resolve.
create or replace function public.proposal_share_lookup(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.proposals p
  where coalesce(p_token, '') ~ '^[0-9a-f]{36}$'
    and (p.share_token_hash = public.share_token_digest(p_token) or (p.share_token_hash is null and p.share_token = p_token))
    and p.share_revoked_at is null and (p.share_expires_at is null or p.share_expires_at > now())
  limit 1;
$$;
create or replace function public.contract_share_lookup(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.contracts c
  where coalesce(p_token, '') ~ '^[0-9a-f]{48}$'
    and (c.share_token_hash = public.share_token_digest(p_token) or (c.share_token_hash is null and c.share_token = p_token))
    and c.share_revoked_at is null and (c.share_expires_at is null or c.share_expires_at > now())
  limit 1;
$$;

create or replace function public.proposal_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('number', p.number, 'title', p.title, 'client_name', p.client_name, 'status', p.status, 'version', p.version, 'valid_until', p.valid_until,
    'subtotal', p.subtotal, 'tax', p.tax, 'total', p.total, 'deposit_pct', p.deposit_pct, 'content', v.snapshot->'content', 'workspace', w.name, 'accepted', p.acceptance)
  from public.proposals p join public.workspaces w on w.id = p.workspace_id
  left join public.proposal_versions v on v.proposal_id = p.id and v.version = p.version
  where p.id = public.proposal_share_lookup(p_token) and p.status in ('sent','viewed','accepted','converted','expired');
$$;

create or replace function public.mark_proposal_viewed(p_token text) returns void
language sql security definer set search_path = '' as $$
  update public.proposals set status = 'viewed' where id = public.proposal_share_lookup(p_token) and status = 'sent';
$$;

create or replace function public.accept_proposal(p_token text, p_name text, p_email text, p_version integer, p_package text default null::text)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.proposals; snap jsonb; pkgs jsonb; pk jsonb; v_rate numeric; v_sub numeric; v_tax numeric; v_tot numeric;
begin
  if p_token !~ '^[0-9a-f]{36}$' or length(coalesce(p_name,'')) < 2 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into p from public.proposals where id = public.proposal_share_lookup(p_token) for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if p.status = 'accepted' or p.status = 'converted' then return 'already_accepted'; end if;
  if p.status not in ('sent','viewed') then raise exception 'not_open' using errcode='22023'; end if;
  if p.version <> p_version then raise exception 'version_changed' using errcode='22023'; end if;
  if p.valid_until is not null and p.valid_until < current_date then update public.proposals set status='expired' where id=p.id; return 'expired'; end if;
  select v.snapshot into snap from public.proposal_versions v where v.proposal_id = p.id and v.version = p.version;
  snap := coalesce(snap, to_jsonb(p));
  pkgs := coalesce(snap #> '{content,packages}', '[]'::jsonb);
  v_rate := coalesce(nullif(snap #>> '{content,tax_rate}', '')::numeric, 20);
  v_sub := coalesce((snap ->> 'subtotal')::numeric, p.subtotal);
  if jsonb_typeof(pkgs) = 'array' and jsonb_array_length(pkgs) > 0 then
    if p_package is null then raise exception 'package_required' using errcode='22023'; end if;
    select x into pk from jsonb_array_elements(pkgs) x where x ->> 'key' = p_package limit 1;
    if pk is null then raise exception 'invalid_package' using errcode='22023'; end if;
    v_sub := v_sub + greatest(coalesce((pk ->> 'price')::numeric, 0), 0);
    v_tax := round(v_sub * v_rate) / 100; v_tot := round(v_sub + v_tax, 2);
  else
    v_tax := coalesce((snap ->> 'tax')::numeric, p.tax); v_tot := coalesce((snap ->> 'total')::numeric, p.total);
  end if;
  update public.proposals set status='accepted', signature_status='signed', accepted_at=now(), accepted_total = v_tot,
    acceptance = jsonb_build_object('name', left(p_name,120), 'email', lower(left(p_email,200)), 'version', p.version, 'at', now(),
      'package', case when pk is null then null else jsonb_build_object('key', pk ->> 'key', 'name', pk ->> 'name', 'price', (pk ->> 'price')::numeric) end,
      'subtotal', v_sub, 'tax', v_tax, 'total', v_tot)
  where id = p.id;
  insert into public.audit_events(workspace_id, event, metadata) values (p.workspace_id, 'proposal.accepted',
    jsonb_build_object('proposal_id', p.id, 'client_id', p.client_id, 'version', p.version, 'email', lower(p_email), 'package', pk ->> 'key', 'total', v_tot));
  return 'accepted';
end; $$;

create or replace function public.contract_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('number', c.number, 'title', c.title, 'status', c.status, 'version', c.sent_version, 'expires_at', c.expires_at, 'value', c.value, 'currency', c.currency,
    'workspace', w.name, 'body', v.body, 'document_hash', v.document_hash, 'signed_at', c.signed_at,
    'parties', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'role', x.role, 'name', x.name, 'organisation', x.organisation, 'signs', x.signs, 'status', x.status, 'signed_at', x.signed_at) order by x.signing_order, x.created_at)
                         from public.contract_parties x where x.contract_id = c.id), '[]'))
  from public.contracts c join public.workspaces w on w.id = c.workspace_id
  left join public.contract_versions v on v.contract_id = c.id and v.version = c.sent_version
  where c.id = public.contract_share_lookup(p_token) and c.status in ('sent','signed','declined','expired');
$$;

create or replace function public.contract_sign_by_token(p_token text, p_name text, p_email text, p_version integer, p_accept boolean, p_ip_hash text default null::text, p_user_agent text default null::text, p_reason text default ''::text)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.contracts; pt public.contract_parties; em text := lower(btrim(coalesce(p_email, '')));
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' or length(btrim(coalesce(p_name, ''))) < 2 or em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into c from public.contracts where id = public.contract_share_lookup(p_token) for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status = 'signed' then return 'already_signed'; end if;
  if c.status <> 'sent' then raise exception 'contract_not_open' using errcode = '22023'; end if;
  if c.sent_version is distinct from p_version then raise exception 'version_changed' using errcode = '22023'; end if;
  if c.expires_at is not null and c.expires_at < current_date then
    update public.contracts set status = 'expired', status_reason = 'Signing window passed' where id = c.id; return 'expired';
  end if;
  select * into pt from public.contract_parties where contract_id = c.id and role = 'client' and signs and email = em order by signing_order limit 1 for update;
  if not found then raise exception 'not_a_signer' using errcode = '42501'; end if;
  if pt.status = 'signed' then return 'already_signed'; end if;
  if not p_accept then
    update public.contract_parties set status = 'declined' where id = pt.id;
    update public.contracts set status = 'declined', declined_at = now(), status_reason = left(coalesce(p_reason, ''), 500) where id = c.id;
    insert into public.audit_events(actor_type, workspace_id, event, metadata) values ('system', c.workspace_id, 'contract.declined', jsonb_build_object('contract_id', c.id, 'party_id', pt.id, 'version', c.sent_version));
    perform public.trust_notify_workspace(c.workspace_id, 'contract_declined', 'Contract declined: ' || c.title, left(coalesce(p_reason, ''), 300), '/organizer/sales/contracts/' || c.id, 'contract.declined:' || c.id || ':' || c.sent_version);
    return 'declined';
  end if;
  return public.contract_record_signature(c, pt.id, 'typed_name', p_name, em, null, p_ip_hash, p_user_agent);
end $$;

-- Owner commands: revoke a live link (optionally set an expiry instead), or for proposals reissue a fresh link.
create or replace function public.proposal_share_revoke(p_proposal uuid, p_reissue boolean default false, p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.proposals; tok text;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if not found or not public.has_workspace_role(p.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_reissue then
    tok := encode(extensions.gen_random_bytes(18), 'hex');
    update public.proposals set share_token = tok where id = p.id;   -- trigger re-hashes and clears revoked/expiry
  elsif p_expires_at is not null then
    update public.proposals set share_expires_at = p_expires_at where id = p.id;
  else
    update public.proposals set share_revoked_at = now() where id = p.id;
  end if;
  insert into public.audit_events(workspace_id, event, metadata) values (p.workspace_id, case when p_reissue then 'proposal.link_reissued' when p_expires_at is not null then 'proposal.link_expiry_set' else 'proposal.link_revoked' end,
    jsonb_build_object('proposal_id', p.id, 'expires_at', p_expires_at));
  return jsonb_build_object('revoked', not p_reissue and p_expires_at is null, 'share_token', tok, 'expires_at', p_expires_at);
end $$;

create or replace function public.contract_share_revoke(p_contract uuid, p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found or not public.has_workspace_role(c.workspace_id, array['owner','manager']) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if c.status = 'signed' then raise exception 'contract_signed_immutable' using errcode = '22023'; end if;
  if p_expires_at is not null then update public.contracts set share_expires_at = p_expires_at where id = c.id;
  else update public.contracts set share_revoked_at = now() where id = c.id; end if;
  insert into public.audit_events(workspace_id, event, metadata) values (c.workspace_id, case when p_expires_at is not null then 'contract.link_expiry_set' else 'contract.link_revoked' end,
    jsonb_build_object('contract_id', c.id, 'expires_at', p_expires_at));
  return jsonb_build_object('revoked', p_expires_at is null, 'expires_at', p_expires_at);
end $$;

revoke all on function public.share_token_digest(text), public.trg_share_token_hash(), public.proposal_share_lookup(text), public.contract_share_lookup(text) from public, anon, authenticated;
grant execute on function public.share_token_digest(text), public.proposal_share_lookup(text), public.contract_share_lookup(text) to service_role;
revoke all on function public.mark_proposal_viewed(text) from public, anon, authenticated;
grant execute on function public.mark_proposal_viewed(text) to service_role;
revoke all on function public.proposal_share_revoke(uuid, boolean, timestamptz), public.contract_share_revoke(uuid, timestamptz) from public, anon;
grant execute on function public.proposal_share_revoke(uuid, boolean, timestamptz), public.contract_share_revoke(uuid, timestamptz) to authenticated, service_role;
-- proposal_by_token / accept_proposal keep their existing anon + authenticated grants (create or replace preserves them);
-- contract_by_token / contract_sign_by_token stay service-only.
