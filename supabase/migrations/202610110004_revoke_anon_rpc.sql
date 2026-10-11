-- Supabase grants EXECUTE to anon explicitly, so `revoke ... from public` does not remove it.
-- Signed-in-only RPCs are revoked from anon. invite_preview (public invite page) and
-- is_workspace_member (used by the anon-readable listings policy) stay callable.
revoke execute on function
  public.respond_to_invite(text, uuid, boolean), public.my_pending_invites(), public.my_workspace_access(),
  public.complete_workspace_onboarding(uuid), public.complete_customer_onboarding(), public.remember_workspace(uuid),
  public.listing_readiness(uuid), public.publish_listing(uuid), public.log_auth_event(text), public.is_workspace_owner(uuid)
from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;
