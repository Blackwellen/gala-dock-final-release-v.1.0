-- Q31 remainder (lane D): who a support case can be assigned to. The admin directory stays own-row-only (Q31 S5); this returns
-- only id + display name of admins holding `support` (and, with p_safeguarding, also `trust`) to support admins. Read-only.
create or replace function public.admin_support_assignees(p_safeguarding boolean default false)
returns table (user_id uuid, name text, title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_permission('support') then raise exception 'not_authorized' using errcode = '42501'; end if;
  return query
    select a.user_id, coalesce(nullif(p.full_name, ''), a.title, 'Admin')::text, a.title
    from public.platform_admins a left join public.profiles p on p.id = a.user_id
    where 'support' = any(a.permissions) and (not coalesce(p_safeguarding, false) or 'trust' = any(a.permissions))
    order by 2 limit 200;
end $$;
revoke all on function public.admin_support_assignees(boolean) from public, anon;
grant execute on function public.admin_support_assignees(boolean) to authenticated;
