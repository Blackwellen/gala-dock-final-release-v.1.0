-- Q31 fix-up (lane D): admin_save_support_macro raised stale_version with SQLSTATE 40001, which the API layer treats as a
-- retryable serialization failure (the request hung until the upstream timeout). Same function, errcode 22023. Signature unchanged.
create or replace function public.admin_save_support_macro(p_id uuid, p_title text, p_body text, p_category text, p_internal boolean, p_set_status text, p_version integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.support_macros; mid uuid;
begin
  perform public.admin_mfa_required();
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_title, ''))) not between 3 and 80 then raise exception 'invalid_title' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 5 and 5000 then raise exception 'body_required' using errcode = '22023'; end if;
  if p_set_status is not null and p_set_status not in ('waiting','escalated') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.support_macros(title, body, category, internal, set_status, created_by)
      values (btrim(p_title), btrim(p_body), nullif(p_category, ''), coalesce(p_internal, false), p_set_status, auth.uid()) returning id into mid;
  else
    select * into m from public.support_macros where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if p_version is not null and p_version <> m.version then raise exception 'stale_version' using errcode = '22023'; end if;   -- not 40001: the API layer retries serialization failures
    update public.support_macros set title = btrim(p_title), body = btrim(p_body), category = nullif(p_category, ''), internal = coalesce(p_internal, false),
      set_status = p_set_status, version = version + 1, updated_at = now() where id = p_id returning id into mid;
  end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'admin', 'support.macro_saved', jsonb_build_object('macro_id', mid, 'created', p_id is null));
  return mid;
end $$;

