-- Q57 marketplace bug hunt (lane bughunt-marketplace), phase A. Additive: one same-signature function replacement, one new trigger
-- function + trigger, and a narrower anon column grant on reviews (a superset of every column the public pages read).
--
-- 1. offer_ticket_transfer refused nothing for a ticket on a card-dispute hold (202611146203). The offer was created and the link
--    sent, and the recipient's accept then failed on gd_0_dispute_hold_guard with a generic error. It now refuses up front with
--    'ticket_on_hold' (same message the app maps for listing/transfer). Otherwise identical to the live definition.
-- 2. Connect seller-country rule (202611146101) only ran on listing/package writes: a workspace whose business country is changed to
--    an unsupported country kept request-to-book / instant-book listings and packages. Changing the country in workspace settings now
--    makes them enquiry-only straight away (never the other way: going back to a supported country leaves the seller to re-enable).
-- 3. reviews: anon could read every published review's user_id (the reviewer's account id), moderated_by (the admin's account id) and
--    moderation_reason. Public pages read id, rating, ratings, body, photos, created_at, build_item_id, provider_response only. anon now
--    gets every column except those three. authenticated is unchanged (own reviews are filtered by user_id).
-- Rollback: re-run offer_ticket_transfer from the live definition (same body minus the hold check); drop trigger
-- workspaces_country_booking_mode and its function; `grant select on public.reviews to anon`.

create or replace function public.offer_ticket_transfer(p_ticket uuid, p_email text, p_name text, p_token_hash text)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare tk public.tickets; tid uuid;
begin
  select * into tk from public.tickets where id = p_ticket and holder_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if tk.status <> 'valid' then raise exception 'not_transferable' using errcode = '22023'; end if;
  if tk.dispute_hold_at is not null then raise exception 'ticket_on_hold' using errcode = '22023', hint = 'This ticket is on hold while a card payment dispute is reviewed.'; end if;
  if coalesce((select (settings->>'transfers')::boolean from public.events where id = tk.event_id), true) = false then raise exception 'transfers_disabled' using errcode = '22023'; end if;
  if lower(p_email) = lower(coalesce((select email from auth.users where id = auth.uid()), '')) then raise exception 'self_transfer' using errcode = '22023'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  update public.ticket_transfers set status = 'cancelled', decided_at = now() where ticket_id = tk.id and status = 'pending';
  insert into public.ticket_transfers(ticket_id, from_user, to_email, to_name, token_hash) values (tk.id, auth.uid(), lower(trim(p_email)), left(trim(coalesce(p_name, '')), 120), p_token_hash) returning id into tid;
  insert into public.audit_events(actor_id, actor_type, event, metadata) values (auth.uid(), 'user', 'ticket.transfer_offered', jsonb_build_object('ticket_id', tk.id, 'transfer_id', tid));
  return tid;
end $function$;

create or replace function public.workspaces_country_booking_mode()
 returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if (old.settings->'organisation'->>'country', old.settings->'business'->>'country', old.settings->>'country')
     is not distinct from (new.settings->'organisation'->>'country', new.settings->'business'->>'country', new.settings->>'country') then
    return null;
  end if;
  if public.workspace_payments_country_ok(new.id) then return null; end if;
  update public.listings set booking_mode = 'enquiry', instant_book = false, updated_at = now()
   where workspace_id = new.id and (booking_mode is distinct from 'enquiry' or instant_book);
  update public.packages set booking_mode = 'enquiry' where workspace_id = new.id and booking_mode is distinct from 'enquiry';
  return null;
end $function$;
revoke all on function public.workspaces_country_booking_mode() from public, anon, authenticated;
drop trigger if exists workspaces_country_booking_mode on public.workspaces;
create trigger workspaces_country_booking_mode after update of settings on public.workspaces
  for each row execute function public.workspaces_country_booking_mode();

revoke select on public.reviews from anon;
grant select (id, listing_id, build_item_id, rating, ratings, body, photos, provider_response, responded_at, status, created_at, updated_at, moderated_at)
  on public.reviews to anon;
