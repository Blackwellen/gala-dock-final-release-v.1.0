-- Ticket holders can correct the attendee name/email on a valid ticket (before entry). The QR nonce rotates so
-- screenshots of the old QR stop working.
create or replace function public.update_ticket_attendee(p_ticket uuid, p_name text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare tk public.tickets;
begin
  select * into tk from public.tickets where id = p_ticket and holder_id = auth.uid() for update;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if tk.status <> 'valid' or tk.checked_in_at is not null then raise exception 'not_editable' using errcode = '22023'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'invalid_email' using errcode = '22023'; end if;
  update public.tickets set attendee_name = trim(p_name), attendee_email = lower(trim(p_email)), qr_nonce = encode(extensions.gen_random_bytes(16), 'hex') where id = tk.id;
end $$;
revoke all on function public.update_ticket_attendee(uuid, text, text) from public, anon;
grant execute on function public.update_ticket_attendee(uuid, text, text) to authenticated;
