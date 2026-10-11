-- Phase 3: quote drafting and sending.
-- Drafts are edited in place; opening a revision never retires the quote the client currently holds.
-- Earlier versions are superseded only when the new version is actually sent.
begin;

create or replace function public.quote_totals(p_items jsonb, p_tax_bps integer, p_discount numeric default 0)
returns table(subtotal numeric, tax numeric, total numeric) language sql immutable set search_path = '' as $$
  with s as (
    select coalesce(sum(greatest(coalesce((i->>'qty')::numeric, 1), 0) * greatest(coalesce((i->>'unit_price')::numeric, 0), 0)), 0) as sub
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
  )
  select round(s.sub, 2), round(greatest(s.sub - coalesce(p_discount, 0), 0) * greatest(least(coalesce(p_tax_bps, 0), 10000), 0) / 10000.0, 2),
         round(greatest(s.sub - coalesce(p_discount, 0), 0) * (1 + greatest(least(coalesce(p_tax_bps, 0), 10000), 0) / 10000.0), 2)
  from s;
$$;

create or replace function public.provider_save_quote_draft(p_item uuid, p_quote uuid, p_items jsonb, p_tax_bps integer, p_deposit_pct integer,
  p_valid_days integer, p_terms jsonb, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare b public.build_items; l public.listings; q public.provider_quotes; t record; v integer; qid uuid; ref text;
begin
  select * into b from public.build_items where id = p_item for update;
  if not found or b.listing_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into l from public.listings where id = b.listing_id;
  perform public.require_provider_role(l.workspace_id, array['owner','manager']);
  if b.status in ('confirmed','fulfilled','cancelled','declined','unavailable') then raise exception 'not_quotable:%', b.status using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'items_required' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) i where length(trim(coalesce(i->>'label', ''))) = 0 or coalesce((i->>'unit_price')::numeric, -1) < 0 or coalesce((i->>'qty')::numeric, 0) <= 0) then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  select * into t from public.quote_totals(p_items, p_tax_bps, coalesce((p_terms->>'discount')::numeric, 0));
  if p_quote is not null then
    select * into q from public.provider_quotes where id = p_quote and build_item_id = b.id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if q.status <> 'draft' then raise exception 'quote_not_draft' using errcode = '22023'; end if;
    update public.provider_quotes set items = p_items, subtotal = t.subtotal, tax = t.tax, total = t.total,
      deposit_pct = greatest(least(coalesce(p_deposit_pct, 30), 100), 0), valid_until = current_date + greatest(coalesce(p_valid_days, 14), 1),
      terms = coalesce(p_terms, '{}') || jsonb_build_object('tax_bps', p_tax_bps), message = left(coalesce(p_message, ''), 4000)
    where id = q.id;
    qid := q.id;
  else
    -- One open draft per request: reuse it rather than stacking drafts.
    select id into qid from public.provider_quotes where build_item_id = b.id and status = 'draft' order by version desc limit 1;
    if qid is not null then
      return public.provider_save_quote_draft(p_item, qid, p_items, p_tax_bps, p_deposit_pct, p_valid_days, p_terms, p_message);
    end if;
    select coalesce(max(version), 0) + 1, coalesce(max(reference), 'Q-' || upper(substr(replace(b.id::text, '-', ''), 1, 6)))
      into v, ref from public.provider_quotes where build_item_id = b.id;
    insert into public.provider_quotes(workspace_id, build_item_id, reference, version, status, items, subtotal, tax, total, deposit_pct, valid_until, terms, message, created_by)
      values (l.workspace_id, b.id, ref, v, 'draft', p_items, t.subtotal, t.tax, t.total, greatest(least(coalesce(p_deposit_pct, 30), 100), 0),
        current_date + greatest(coalesce(p_valid_days, 14), 1), coalesce(p_terms, '{}') || jsonb_build_object('tax_bps', p_tax_bps), left(coalesce(p_message, ''), 4000), auth.uid())
      returning id into qid;
  end if;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), l.workspace_id, 'quote.drafted', jsonb_build_object('quote_id', qid, 'build_item_id', b.id, 'total', t.total));
  return qid;
end $$;

create or replace function public.provider_send_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q public.provider_quotes; b public.build_items;
begin
  select * into q from public.provider_quotes where id = p_quote for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.require_provider_role(q.workspace_id, array['owner','manager']);
  if q.status <> 'draft' then raise exception 'quote_not_draft' using errcode = '22023'; end if;
  select * into b from public.build_items where id = q.build_item_id for update;
  if b.status in ('confirmed','fulfilled','cancelled','declined','unavailable','expired') then raise exception 'not_quotable:%', b.status using errcode = '22023'; end if;
  -- A first response must still be inside the response window; later revisions are allowed while the request is live.
  if b.status in ('sent','awaiting') and b.response_deadline is not null and b.response_deadline < now() then
    update public.build_items set status = 'expired', updated_at = now() where id = b.id;
    raise exception 'request_expired' using errcode = '22023';
  end if;
  if jsonb_array_length(q.items) = 0 or q.total <= 0 then raise exception 'items_required' using errcode = '22023'; end if;
  update public.provider_quotes set status = 'superseded' where build_item_id = q.build_item_id and id <> q.id and status in ('sent','viewed');
  update public.provider_quotes set status = 'sent', sent_at = now() where id = q.id;
  update public.build_items set status = case when status = 'held' then 'held' else 'quoted' end, amount = q.total, deposit = round(q.total * q.deposit_pct / 100.0, 2), price_basis = 'quote',
    quote = jsonb_build_object('quote_id', q.id, 'reference', q.reference, 'version', q.version, 'items', q.items, 'subtotal', q.subtotal, 'tax', q.tax, 'total', q.total,
      'deposit_pct', q.deposit_pct, 'valid_until', q.valid_until, 'terms', q.terms, 'message', q.message), updated_at = now()
  where id = b.id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), q.workspace_id, 'quote.sent', jsonb_build_object('quote_id', q.id, 'build_item_id', b.id, 'version', q.version, 'total', q.total));
  return q.id;
end $$;

revoke all on function public.quote_totals(jsonb, integer, numeric), public.provider_save_quote_draft(uuid, uuid, jsonb, integer, integer, integer, jsonb, text),
  public.provider_send_quote(uuid) from public, anon;
grant execute on function public.quote_totals(jsonb, integer, numeric), public.provider_save_quote_draft(uuid, uuid, jsonb, integer, integer, integer, jsonb, text),
  public.provider_send_quote(uuid) to authenticated;
commit;
