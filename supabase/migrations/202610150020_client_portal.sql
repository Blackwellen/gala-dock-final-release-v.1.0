-- PORT-001 Client portal: revocable, expiring share links for an event's client (the person who commissioned it).
-- Only the SHA-256 hex hash of a link token is stored. Clients never get table access: every read and action goes
-- through security-definer RPCs that validate the token hash, expiry and revocation. Organizer-side issue/revoke RPCs
-- require public.can_edit_event(event_id). State changes are written to public.audit_events.
begin;

create table if not exists public.portal_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  client_name text not null check (length(btrim(client_name)) between 1 and 120),
  client_email text not null default '' check (length(client_email) <= 254),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  check (expires_at > created_at)
);
create index if not exists portal_links_event_idx on public.portal_links(event_id, created_at desc);

-- Decisions the organizer asks the client to make (supplier packages, menus, creative, site plans).
create table if not exists public.portal_approvals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  build_item_id uuid references public.build_items(id) on delete set null,
  kind text not null default 'approval' check (kind in ('approval','confirm','review','sign_off')),
  title text not null check (length(title) between 1 and 160),
  supplier text not null default '',
  detail text not null default '',
  amount numeric(12,2),
  image text not null default '',
  items_count integer check (items_count is null or items_count > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  due_at timestamptz,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_link uuid references public.portal_links(id) on delete set null,
  decided_name text,
  decision_note text not null default '' check (length(decision_note) <= 1000),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists portal_approvals_event_idx on public.portal_approvals(event_id, status, submitted_at desc);

-- Files the organizer shares with the client (served only through portal_document()).
create table if not exists public.portal_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  tag text not null default 'Document' check (length(tag) <= 40),
  mime text not null default 'application/pdf',
  body bytea not null,
  size_bytes integer generated always as (octet_length(body)) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_documents_event_idx on public.portal_documents(event_id, updated_at desc);

-- Client <-> organizer conversation for the event.
create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  link_id uuid references public.portal_links(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (length(author_name) between 1 and 120),
  author_avatar text not null default '',
  from_client boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists portal_messages_event_idx on public.portal_messages(event_id, created_at desc);

-- ── RLS: organizer-side access only. Clients reach these rows exclusively through the RPCs below. ──
alter table public.portal_links enable row level security;
alter table public.portal_approvals enable row level security;
alter table public.portal_documents enable row level security;
alter table public.portal_messages enable row level security;

drop policy if exists portal_links_read on public.portal_links;
create policy portal_links_read on public.portal_links for select to authenticated using (public.can_access_event(event_id));
drop policy if exists portal_approvals_read on public.portal_approvals;
create policy portal_approvals_read on public.portal_approvals for select to authenticated using (public.can_access_event(event_id));
drop policy if exists portal_approvals_write on public.portal_approvals;
create policy portal_approvals_write on public.portal_approvals for insert to authenticated with check (public.can_edit_event(event_id) and status = 'pending');
drop policy if exists portal_approvals_edit on public.portal_approvals;
create policy portal_approvals_edit on public.portal_approvals for update to authenticated using (public.can_edit_event(event_id) and status = 'pending') with check (public.can_edit_event(event_id) and status = 'pending');
drop policy if exists portal_documents_read on public.portal_documents;
create policy portal_documents_read on public.portal_documents for select to authenticated using (public.can_access_event(event_id));
drop policy if exists portal_documents_write on public.portal_documents;
create policy portal_documents_write on public.portal_documents for insert to authenticated with check (public.can_edit_event(event_id));
drop policy if exists portal_documents_delete on public.portal_documents;
create policy portal_documents_delete on public.portal_documents for delete to authenticated using (public.can_edit_event(event_id));
drop policy if exists portal_messages_read on public.portal_messages;
create policy portal_messages_read on public.portal_messages for select to authenticated using (public.can_access_event(event_id));
drop policy if exists portal_messages_write on public.portal_messages;
create policy portal_messages_write on public.portal_messages for insert to authenticated
  with check (public.can_edit_event(event_id) and not from_client and link_id is null and author_id = (select auth.uid()));

revoke all on public.portal_links, public.portal_approvals, public.portal_documents, public.portal_messages from anon, authenticated;
-- token_hash is never selectable, even by the organizer.
grant select (id, event_id, client_name, client_email, created_by, created_at, expires_at, revoked_at, revoked_by, last_opened_at, open_count) on public.portal_links to authenticated;
grant select, insert, update on public.portal_approvals to authenticated;
grant select (id, event_id, title, tag, mime, size_bytes, created_by, created_at, updated_at), insert, delete on public.portal_documents to authenticated;
grant select, insert on public.portal_messages to authenticated;

-- ── Token validation (internal) ──
create or replace function public.portal_link_for(p_token_hash text) returns public.portal_links
language sql stable security definer set search_path = '' as $$
  select l.* from public.portal_links l
  where p_token_hash ~ '^[0-9a-f]{64}$' and l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now();
$$;
revoke all on function public.portal_link_for(text) from public, anon, authenticated;

-- ── Organizer: issue / revoke ──
-- Returns the plaintext token exactly once; only its SHA-256 hash is stored. Share URL: /portal/<token>.
create or replace function public.portal_issue_link(p_event uuid, p_client_name text, p_client_email text default '', p_valid_days integer default 30)
returns table(link_id uuid, token text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_exp timestamptz; v_ws uuid;
begin
  if auth.uid() is null or not public.can_edit_event(p_event) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_client_name, ''))) not between 1 and 120 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_valid_days is null or p_valid_days not between 1 and 365 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if length(coalesce(p_client_email, '')) > 254 or (coalesce(p_client_email, '') <> '' and p_client_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- 256-bit token, base64url without padding (43 chars) — same format as createInviteToken().
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_exp := now() + make_interval(days => p_valid_days);
  insert into public.portal_links(event_id, token_hash, client_name, client_email, created_by, expires_at)
    values (p_event, encode(extensions.digest(v_token, 'sha256'), 'hex'), btrim(p_client_name), lower(btrim(coalesce(p_client_email, ''))), auth.uid(), v_exp)
    returning id into v_id;
  select workspace_id into v_ws from public.events where id = p_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), v_ws, 'portal.link_issued', jsonb_build_object('event_id', p_event, 'link_id', v_id, 'expires_at', v_exp));
  return query select v_id, v_token, v_exp;
end $$;

create or replace function public.portal_revoke_link(p_link uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_event uuid; v_ws uuid;
begin
  select event_id into v_event from public.portal_links where id = p_link;
  if v_event is null or auth.uid() is null or not public.can_edit_event(v_event) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.portal_links set revoked_at = now(), revoked_by = auth.uid() where id = p_link and revoked_at is null;
  select workspace_id into v_ws from public.events where id = v_event;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (auth.uid(), v_ws, 'portal.link_revoked', jsonb_build_object('event_id', v_event, 'link_id', p_link));
end $$;

-- ── Client: read ──
create or replace function public.portal_view(p_token_hash text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.portal_links; e public.events; v_ws text; v_first boolean;
begin
  l := public.portal_link_for(p_token_hash);
  if l.id is null then return null; end if;
  -- Coarse abuse guard on reads (per link).
  if not public.hit_rate_limit('portal:view:' || l.id, 600, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  select * into e from public.events where id = l.event_id;
  select name into v_ws from public.workspaces where id = e.workspace_id;
  v_first := l.open_count = 0;
  update public.portal_links set open_count = open_count + 1, last_opened_at = now() where id = l.id;
  if v_first then
    insert into public.audit_events(actor_id, workspace_id, event, metadata)
      values (null, e.workspace_id, 'portal.link_first_opened', jsonb_build_object('event_id', e.id, 'link_id', l.id));
  end if;
  return jsonb_build_object(
    'link', jsonb_build_object('id', l.id, 'client_name', l.client_name, 'expires_at', l.expires_at),
    'organizer', coalesce(v_ws, ''),
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'visibility', e.visibility,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue_name', e.venue_name, 'city', e.city, 'location', e.location,
      'guest_count', e.guest_count, 'capacity', e.capacity, 'budget_total', e.budget_total, 'currency', e.currency,
      'tags', e.tags, 'cover_image', e.cover_image, 'updated_at', e.updated_at,
      'venue_confirmed', coalesce((e.settings ->> 'venue_confirmed')::boolean, false), 'video_url', e.settings ->> 'video_url'),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'detail', t.detail, 'category', t.category,
        'due_at', t.due_at, 'status', t.status) order by t.due_at nulls last)
      from public.tasks t where t.event_id = e.id and t.milestone), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('category', b.category, 'status', b.status, 'amount', b.amount))
      from public.build_items b where b.event_id = e.id and b.role = 'primary'), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'title', a.title, 'supplier', a.supplier, 'detail', a.detail,
        'amount', a.amount, 'image', a.image, 'items_count', a.items_count, 'status', a.status, 'due_at', a.due_at,
        'submitted_at', a.submitted_at, 'decided_at', a.decided_at, 'decided_name', a.decided_name, 'decision_note', a.decision_note)
        order by a.submitted_at desc)
      from public.portal_approvals a where a.event_id = e.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'tag', d.tag, 'size_bytes', d.size_bytes, 'updated_at', d.updated_at)
        order by d.updated_at desc)
      from public.portal_documents d where d.event_id = e.id), '[]'::jsonb),
    -- Invoices addressed to this client only (by email when the link has one, otherwise by client name). Drafts are listed as "not issued".
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'reference', i.reference, 'status', i.status,
        'issue_date', i.issue_date, 'due_date', i.due_date, 'total', i.total, 'amount_paid', i.amount_paid, 'currency', i.currency) order by i.number)
      from public.invoices i where i.event_id = e.id and i.status not in ('cancelled')
        and ((l.client_email <> '' and lower(i.client_email) = l.client_email) or (l.client_email = '' and lower(i.client_name) = lower(l.client_name)))), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_name', m.author_name, 'author_avatar', m.author_avatar,
        'from_client', m.from_client, 'body', m.body, 'read_at', m.read_at, 'created_at', m.created_at) order by m.created_at desc)
      from (select * from public.portal_messages where event_id = e.id order by created_at desc limit 50) m), '[]'::jsonb)
  );
end $$;

-- ── Client: actions ──
create or replace function public.portal_decide(p_token_hash text, p_approval uuid, p_decision text, p_note text default '')
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare l public.portal_links; a public.portal_approvals; v_ws uuid;
begin
  l := public.portal_link_for(p_token_hash);
  if l.id is null then raise exception 'invalid_link' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected') or length(coalesce(p_note, '')) > 1000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_decision = 'rejected' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'note_required' using errcode = '22023'; end if;
  if not public.hit_rate_limit('portal:decide:' || l.id, 30, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  select * into a from public.portal_approvals where id = p_approval and event_id = l.event_id for update;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then return a.status; end if;
  update public.portal_approvals set status = p_decision, decided_at = now(), decided_link = l.id, decided_name = l.client_name,
    decision_note = btrim(coalesce(p_note, '')) where id = a.id;
  insert into public.portal_messages(event_id, link_id, author_name, from_client, body)
    values (l.event_id, l.id, l.client_name, true,
      case when p_decision = 'approved' then 'Approved: ' || a.title else 'Rejected: ' || a.title || ' — ' || btrim(p_note) end);
  select workspace_id into v_ws from public.events where id = l.event_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (null, v_ws, 'portal.approval_' || p_decision, jsonb_build_object('event_id', l.event_id, 'link_id', l.id, 'approval_id', a.id, 'title', a.title, 'amount', a.amount));
  return p_decision;
end $$;

create or replace function public.portal_comment(p_token_hash text, p_body text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare l public.portal_links; v_id uuid; v_ws uuid;
begin
  l := public.portal_link_for(p_token_hash);
  if l.id is null then raise exception 'invalid_link' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.hit_rate_limit('portal:comment:' || l.id, 20, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.portal_messages(event_id, link_id, author_name, from_client, body)
    values (l.event_id, l.id, l.client_name, true, btrim(p_body)) returning id into v_id;
  select workspace_id into v_ws from public.events where id = l.event_id;
  insert into public.audit_events(actor_id, workspace_id, event, metadata)
    values (null, v_ws, 'portal.client_message', jsonb_build_object('event_id', l.event_id, 'link_id', l.id, 'message_id', v_id));
  return v_id;
end $$;

-- Shared document download (bytes are returned to the server route, never exposed through table grants).
create or replace function public.portal_document(p_token_hash text, p_document uuid)
returns table(title text, mime text, body bytea)
language plpgsql volatile security definer set search_path = '' as $$
declare l public.portal_links;
begin
  l := public.portal_link_for(p_token_hash);
  if l.id is null then return; end if;
  if not public.hit_rate_limit('portal:download:' || l.id, 120, 3600) then raise exception 'rate_limited' using errcode = '54000'; end if;
  return query select d.title, d.mime, d.body from public.portal_documents d where d.id = p_document and d.event_id = l.event_id;
end $$;

revoke all on function public.portal_issue_link(uuid, text, text, integer), public.portal_revoke_link(uuid),
  public.portal_view(text), public.portal_decide(text, uuid, text, text), public.portal_comment(text, text), public.portal_document(text, uuid) from public;
grant execute on function public.portal_issue_link(uuid, text, text, integer), public.portal_revoke_link(uuid) to authenticated;
grant execute on function public.portal_view(text), public.portal_decide(text, uuid, text, text), public.portal_comment(text, text), public.portal_document(text, uuid) to anon, authenticated;

commit;
