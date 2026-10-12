-- Help Centre "Contact support" for every signed-in user (customer, organiser, provider). Creates a support case + the first
-- message, visible to the requester (support_read / support_messages_read policies) and to admins with the 'support' permission.
-- The workspace is attached only if the caller is a member of it. Rate limited to 5 requests per hour per user.
create or replace function public.contact_support(p_subject text, p_body text, p_category text default 'other', p_workspace uuid default null, p_source text default 'Help Centre')
returns text language plpgsql security definer set search_path = '' as $$
declare v_case uuid; v_ref text; n integer; v_name text; v_ws uuid; v_ws_name text; v_cat text;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_subject, ''))) not between 3 and 200 or length(btrim(coalesce(p_body, ''))) not between 10 and 5000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_cat := case when p_category in ('booking','ticketing','payment','account','technical','refund','other') then p_category else 'other' end;
  if not public.hit_rate_limit('support:contact:' || auth.uid(), 5, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  if p_workspace is not null and exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = auth.uid()) then
    v_ws := p_workspace; select name into v_ws_name from public.workspaces where id = v_ws;
  end if;
  select coalesce(nullif(p.full_name, ''), u.email, 'Gala Dock user') into v_name from auth.users u left join public.profiles p on p.id = u.id where u.id = auth.uid();
  select coalesce(max(substring(reference from '^SUP-(\d+)$')::int), 4400) + 1 into n from public.support_cases where reference ~ '^SUP-\d+$';
  v_ref := 'SUP-' || n;
  insert into public.support_cases(reference, subject, category, priority, status, requester_id, requester_name, workspace_id, sla_due_at, related)
    values (v_ref, btrim(p_subject), v_cat, case when v_cat in ('payment','refund') then 'high' else 'medium' end, 'open', auth.uid(), left(v_name, 120), v_ws,
      now() + case when v_cat in ('payment','refund') then interval '4 hours' else interval '8 hours' end,
      jsonb_build_object('source', left(coalesce(nullif(btrim(p_source), ''), 'Help Centre'), 60)) || case when v_ws is null then '{}'::jsonb else jsonb_build_object('workspace', v_ws_name) end)
    returning id into v_case;
  insert into public.support_messages(case_id, author_id, author, body, internal, role) values (v_case, auth.uid(), left(v_name, 120), btrim(p_body), false, 'customer');
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata)
    values (auth.uid(), 'user', v_ws, 'support.case_opened', jsonb_build_object('case_id', v_case, 'reference', v_ref, 'category', v_cat, 'source', p_source));
  return v_ref;
end $$;
revoke all on function public.contact_support(text, text, text, uuid, text) from public, anon;
grant execute on function public.contact_support(text, text, text, uuid, text) to authenticated;
