-- Q16 (lane C, 2026-10-29) fix-forward for 202610293009: accept_proposal's local variables `tax` / `subtotal`-style names
-- collided with proposals columns inside the UPDATE ("column reference tax is ambiguous", 42702), so acceptance failed for
-- every proposal. Same signature and grants; locals renamed with a v_ prefix. No data change.
create or replace function public.accept_proposal(p_token text, p_name text, p_email text, p_version integer, p_package text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.proposals; snap jsonb; pkgs jsonb; pk jsonb; v_rate numeric; v_sub numeric; v_tax numeric; v_tot numeric;
begin
  if p_token !~ '^[0-9a-f]{36}$' or length(coalesce(p_name,'')) < 2 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input' using errcode='22023'; end if;
  select * into p from public.proposals where share_token = p_token for update;
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
revoke all on function public.accept_proposal(text, text, text, integer, text) from public;
grant execute on function public.accept_proposal(text, text, text, integer, text) to anon, authenticated;

