-- Settings bug hunt (Q60 settings sub-lane, 2026-11-14). Account -> Security -> Change password re-checked the current password with
-- auth.signInWithPassword() on the server (cookie) client. With Supabase captcha (Turnstile) on, that call carries no captcha token and
-- always fails, so every user was told "Your current password is incorrect"; for MFA users it also replaced the aal2 session cookie with
-- a fresh aal1 session, so the following updateUser() failed (insufficient_aal). This checks the caller's OWN password hash in the
-- database instead: own row only (auth.uid()), rate limited (5 per 15 minutes), no session or sign-in side effects, never returns the hash.
-- Additive: new function only.
create or replace function public.verify_my_password(p_password text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); h text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.hit_rate_limit('verify-password:' || uid::text, 5, 900) then raise exception 'rate_limited' using errcode = '54000'; end if;
  select u.encrypted_password into h from auth.users u where u.id = uid;
  -- Accounts created with Google or a passkey have no password: nothing can match.
  if coalesce(h, '') = '' or coalesce(p_password, '') = '' or length(p_password) > 200 then return false; end if;
  return extensions.crypt(p_password, h) = h;
end $$;

revoke all on function public.verify_my_password(text) from public, anon;
grant execute on function public.verify_my_password(text) to authenticated, service_role;
