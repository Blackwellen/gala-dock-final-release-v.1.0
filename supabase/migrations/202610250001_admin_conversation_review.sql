-- Admin safeguarding review of member conversations (support permission).
-- Listing returns metadata only (no message text). Reading a conversation requires a written reason and always writes an audit event
-- first; message bodies are only returned by admin_open_conversation. Read-only: admins cannot post, edit or delete here.
begin;

create or replace function public.admin_list_conversations(p_q text default '', p_kind text default '', p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(coalesce(trim(p_q), ''));
begin
  if not public.has_admin_permission('support') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(x) order by x.last_message_at desc) from (
    select c.id, c.kind, c.subject, c.created_at, c.last_message_at,
      (select count(*) from public.conversation_messages m where m.conversation_id = c.id and m.deleted_at is null) as messages,
      (select coalesce(jsonb_agg(coalesce(nullif(p.label, ''), w.name, pr.full_name, 'Member') order by p.created_at), '[]') from public.conversation_participants p
         left join public.workspaces w on w.id = p.workspace_id left join public.profiles pr on pr.id = p.user_id where p.conversation_id = c.id) as participants,
      e.name as event_name, l.name as listing_name,
      (select max(a.created_at) from public.audit_events a where a.event = 'admin.conversation_opened' and a.metadata->>'conversation_id' = c.id::text) as last_reviewed_at
    from public.conversations c left join public.events e on e.id = c.event_id left join public.listings l on l.id = c.listing_id
    where (p_kind = '' or c.kind = p_kind)
      and (q = '' or lower(c.subject) like '%' || q || '%' or lower(coalesce(e.name, '')) like '%' || q || '%' or lower(coalesce(l.name, '')) like '%' || q || '%'
        or exists (select 1 from public.conversation_participants p left join public.workspaces w on w.id = p.workspace_id left join public.profiles pr on pr.id = p.user_id
                   where p.conversation_id = c.id and lower(coalesce(nullif(p.label, ''), w.name, pr.full_name, '')) like '%' || q || '%'))
    order by c.last_message_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x), '[]'::jsonb);
end $$;

create or replace function public.admin_open_conversation(p_conv uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c public.conversations;
begin
  if not public.has_admin_permission('support') then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'reason_required' using errcode = '22023', hint = 'Give a reason of at least 10 characters.'; end if;
  select * into c from public.conversations where id = p_conv;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, actor_type, event, metadata)
    values (auth.uid(), 'admin', 'admin.conversation_opened', jsonb_build_object('conversation_id', c.id, 'kind', c.kind, 'subject', c.subject, 'reason', trim(p_reason)));
  return jsonb_build_object(
    'conversation', jsonb_build_object('id', c.id, 'kind', c.kind, 'subject', c.subject, 'created_at', c.created_at, 'last_message_at', c.last_message_at),
    'participants', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.label, ''), w.name, pr.full_name, 'Member'), 'type', case when p.workspace_id is null then 'person' else 'workspace' end, 'left', p.left_at is not null) order by p.created_at), '[]')
       from public.conversation_participants p left join public.workspaces w on w.id = p.workspace_id left join public.profiles pr on pr.id = p.user_id where p.conversation_id = c.id),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender', coalesce(nullif(m.sender_name, ''), pr.full_name, 'Member'), 'body', case when m.deleted_at is null then m.body else '' end,
       'deleted', m.deleted_at is not null, 'edited', m.edited_at is not null, 'attachments', jsonb_array_length(m.attachments), 'created_at', m.created_at) order by m.created_at), '[]')
       from public.conversation_messages m left join public.profiles pr on pr.id = m.sender_id where m.conversation_id = c.id),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'by', coalesce(pr.full_name, 'Admin'), 'reason', a.metadata->>'reason') order by a.created_at desc), '[]')
       from public.audit_events a left join public.profiles pr on pr.id = a.actor_id where a.event = 'admin.conversation_opened' and a.metadata->>'conversation_id' = c.id::text));
end $$;

revoke all on function public.admin_list_conversations(text, text, integer, integer), public.admin_open_conversation(uuid, text) from public, anon;
grant execute on function public.admin_list_conversations(text, text, integer, integer), public.admin_open_conversation(uuid, text) to authenticated;
commit;
