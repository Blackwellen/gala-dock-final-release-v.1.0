-- Supabase grants EXECUTE to anon/authenticated explicitly on new functions; "revoke from public" is not enough.
-- No Phase 2 function is callable anonymously. Ticket issuing and expiry are service-role only.
begin;
revoke execute on function public.can_access_event(uuid), public.has_workspace_role(uuid,text[]), public.can_see_event_money(uuid),
  public.event_readiness(uuid), public.issue_tickets(uuid,int,text,text,uuid), public.check_in_ticket(uuid,text,text),
  public.transfer_ticket(uuid,text,text), public.list_ticket_for_resale(uuid,boolean), public.transition_build_item(uuid,text,int),
  public.expire_stale_items(), public.upgrade_event_to_professional(uuid,uuid), public.issue_proposal(uuid), public.revise_proposal(uuid),
  public.issue_invoice(uuid), public.credit_invoice(uuid), public.decide_agent_approval(uuid,boolean) from anon;
revoke execute on function public.issue_tickets(uuid,int,text,text,uuid), public.expire_stale_items() from authenticated;
grant execute on function public.issue_tickets(uuid,int,text,text,uuid), public.expire_stale_items() to service_role;
-- Restrict future functions in this schema the same way.
alter default privileges in schema public revoke execute on functions from anon;
commit;
