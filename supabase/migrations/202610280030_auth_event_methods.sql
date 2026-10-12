-- Audit sign-ins by method: passkey (release spec §7) and Gala Dock's own Google sign-in join the allowed auth events.
create or replace function public.log_auth_event(p_event text) returns void
language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null or p_event not in ('auth.login', 'auth.login_passkey', 'auth.login_google', 'auth.mfa_verified', 'auth.mfa_enrolled', 'auth.password_reset', 'auth.signed_out', 'auth.email_verified') then
    return;
  end if;
  insert into public.audit_events(actor_id, event) values (auth.uid(), p_event);
end;
$function$;
