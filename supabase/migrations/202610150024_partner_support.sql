-- PART-001: a partner opens a support case with the partnerships team from the partner portal.
-- The case lands in the existing admin support queue (support_cases) tagged with the partner; rate-limited per user.
begin;

create or replace function public.partner_contact_support(p_subject text, p_body text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_partner public.partners; v_case uuid; v_ref text; n integer; v_name text;
begin
  select * into v_partner from public.partners where user_id = auth.uid() and status <> 'terminated' limit 1;
  if auth.uid() is null or v_partner.id is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_subject, ''))) not between 3 and 200 or length(btrim(coalesce(p_body, ''))) not between 10 and 5000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.hit_rate_limit('partner:support:' || auth.uid(), 5, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  select coalesce(nullif(p.full_name, ''), v_partner.name) into v_name from public.profiles p where p.id = auth.uid();
  select coalesce(max(substring(reference from '^SUP-(\d+)$')::int), 4400) + 1 into n from public.support_cases where reference ~ '^SUP-\d+$';
  v_ref := 'SUP-' || n;
  insert into public.support_cases(reference, subject, category, priority, status, requester_id, requester_name, sla_due_at, related)
    values (v_ref, btrim(p_subject), 'account', 'medium', 'open', auth.uid(), left(coalesce(v_name, v_partner.name), 120), now() + interval '8 hours',
      jsonb_build_object('source', 'Partner portal', 'partner_id', v_partner.id, 'partner', v_partner.name))
    returning id into v_case;
  insert into public.support_messages(case_id, author_id, author, body, internal, role) values (v_case, auth.uid(), left(coalesce(v_name, v_partner.name), 120), btrim(p_body), false, 'customer');
  insert into public.audit_events(actor_id, event, metadata) values (auth.uid(), 'partner.support_case_opened', jsonb_build_object('case_id', v_case, 'reference', v_ref, 'partner_id', v_partner.id));
  return v_ref;
end $$;
revoke all on function public.partner_contact_support(text, text) from public, anon;
grant execute on function public.partner_contact_support(text, text) to authenticated;

commit;
