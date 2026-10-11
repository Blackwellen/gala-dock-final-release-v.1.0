-- Fix: `text[] || 'literal'` resolves as array || array and fails with "malformed array literal".
-- array_append always treats the right-hand side as an element.
create or replace function public.listing_readiness(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.listings; ws public.workspaces; missing text[] := '{}';
begin
  select * into l from public.listings where id = p_listing;
  if not found or not public.is_workspace_member(l.workspace_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into ws from public.workspaces where id = l.workspace_id;
  if length(trim(l.name)) < 3 then missing := array_append(missing, 'listing_name'); end if;
  if length(trim(l.description)) < 40 then missing := array_append(missing, 'listing_description'); end if;
  if length(trim(l.location)) = 0 then missing := array_append(missing, 'listing_location'); end if;
  if coalesce(jsonb_array_length(l.details->'photos'), 0) = 0 then missing := array_append(missing, 'listing_photo'); end if;
  if not ws.onboarding_complete then missing := array_append(missing, 'workspace_setup'); end if;
  if ws.verification_status <> 'verified' then missing := array_append(missing, 'verification'); end if;
  if ws.payout_status <> 'active' then missing := array_append(missing, 'payouts'); end if;
  return jsonb_build_object('eligible', cardinality(missing) = 0, 'missing', to_jsonb(missing),
    'verification_status', ws.verification_status, 'payout_status', ws.payout_status, 'published', l.published);
end;
$$;
