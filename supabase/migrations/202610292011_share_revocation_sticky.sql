-- Q16 follow-up: proposals are table-level updatable by workspace members under RLS, so a revoked link could be un-revoked with a
-- direct update. Revocation is now sticky: only a token change (reissue / contract re-send) clears it. The hash is always derived.
create or replace function public.trg_share_token_hash() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.share_token_hash := case when new.share_token is null or new.share_token = '' then null else encode(sha256(convert_to(new.share_token, 'UTF8')), 'hex') end;
  if tg_op = 'UPDATE' then
    if new.share_token is distinct from old.share_token then
      new.share_revoked_at := null; new.share_expires_at := null;
    elsif old.share_revoked_at is not null then
      new.share_revoked_at := old.share_revoked_at;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.trg_share_token_hash() from public, anon, authenticated;
