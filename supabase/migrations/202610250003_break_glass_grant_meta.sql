-- Grant page metadata: subject/kind/last activity of the conversations in a grant's scope (no message text).
-- Needed because admins no longer have blanket read access to conversations (202610250002).
create or replace function public.admin_grant_conversations(p_grant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ids uuid[];
begin
  if not (public.has_admin_permission('support.break_glass_conversation.read') or public.has_admin_permission('audit')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select conversation_ids into ids from public.break_glass_grants where id = p_grant;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject, 'kind', c.kind, 'last_message_at', c.last_message_at) order by c.last_message_at desc)
    from public.conversations c where c.id = any(coalesce(ids, '{}'))), '[]'::jsonb);
end $$;
revoke all on function public.admin_grant_conversations(uuid) from public, anon;
grant execute on function public.admin_grant_conversations(uuid) to authenticated;
