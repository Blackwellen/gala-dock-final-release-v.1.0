-- Demo workspaces (release spec §87). Demo data never mixes with a real workspace: it lives in its own workspace, flagged
-- settings.demo = true, named "Demo · …", invisible to the public marketplace (listings unpublished, events private), and can be reset
-- or deleted by its owner. Personas: organizer, venue, supplier.
create or replace function public.create_demo_workspace(p_persona text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ws uuid; kind text; e1 uuid; e2 uuid; e3 uuid; t date := current_date; venue uuid; tag text := 'DEMO';
begin
  if uid is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_persona not in ('organizer','venue','supplier') then raise exception 'invalid_persona' using errcode = '22023'; end if;
  if (select count(*) from public.workspaces w where w.owner_id = uid and coalesce((w.settings ->> 'demo')::boolean, false)) >= 3 then raise exception 'limit_reached' using errcode = '22023'; end if;
  kind := case when p_persona = 'organizer' then 'organizer' else 'provider' end;
  insert into public.workspaces(owner_id, name, kind, settings, capabilities, onboarding_step, onboarding_complete, plan)
    values (uid, case p_persona when 'organizer' then 'Demo · Northern Lights Events' when 'venue' then 'Demo · The Old Mill Venue' else 'Demo · Feast & Co Catering' end, kind,
      jsonb_build_object('demo', true, 'demo_persona', p_persona, 'demo_created_at', now()), case p_persona when 'venue' then array['venue'] when 'supplier' then array['service'] else '{}'::text[] end,
      'complete', true, 'pro')
    returning id into ws;

  if p_persona = 'organizer' then
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, location, city, guest_count, capacity, budget_total, revenue_goal, currency, description, tags, settings)
      values (uid, ws, 'professional', 'Winter Charity Gala', 'awards', 'private', 'on_sale', (t + 45) + time '19:00', (t + 45) + time '23:30', 'The Grand Assembly Rooms', 'King Street', 'Manchester', 280, 320, 42000, 65000, 'GBP',
        'Black-tie dinner, auction and live band raising funds for local youth charities.', array[tag], jsonb_build_object('demo', true)) returning id into e1;
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, location, city, guest_count, capacity, budget_total, revenue_goal, currency, description, tags, settings)
      values (uid, ws, 'professional', 'Riverside Summer Festival', 'festival', 'private', 'planning', (t + 120) + time '12:00', (t + 121) + time '22:00', 'Riverside Park', 'Riverside Park', 'Leeds', 3500, 4000, 185000, 260000, 'GBP',
        'Two-day food, music and family festival on the river.', array[tag], jsonb_build_object('demo', true)) returning id into e2;
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, location, city, guest_count, capacity, budget_total, currency, description, tags, settings)
      values (uid, ws, 'professional', 'Product Launch Breakfast', 'corporate', 'private', 'ready', (t + 18) + time '08:00', (t + 18) + time '11:00', 'Glasshouse Studios', 'Ancoats', 'Manchester', 120, 150, 9500, 'GBP',
        'Invite-only launch with keynote, demo stations and breakfast.', array[tag], jsonb_build_object('demo', true)) returning id into e3;
    insert into public.ticket_tiers(event_id, name, price, quantity, sold, status, sort) values
      (e1, 'Early bird', 95, 80, 80, 'sold_out', 1), (e1, 'Standard', 125, 180, 112, 'on_sale', 2), (e1, 'Table of 10', 1150, 6, 3, 'on_sale', 3),
      (e2, 'Day ticket', 35, 2500, 0, 'draft', 1), (e2, 'Weekend', 60, 1200, 0, 'draft', 2);
    insert into public.programme_items(event_id, starts_at, duration_minutes, title, area, kind) values
      (e1, (t + 45) + time '19:00', 60, 'Drinks reception', 'Foyer', 'programme'), (e1, (t + 45) + time '20:00', 90, 'Dinner', 'Main hall', 'programme'),
      (e1, (t + 45) + time '21:30', 45, 'Charity auction', 'Main hall', 'programme'), (e1, (t + 45) + time '22:15', 75, 'Live band', 'Main hall', 'programme');
    insert into public.tasks(event_id, workspace_id, owner_id, title, category, due_at, priority, status) values
      (e1, ws, uid, 'Confirm final table plan', 'guests', (t + 38)::timestamptz, 'high', 'todo'), (e1, ws, uid, 'Send auction lot list to printer', 'production', (t + 30)::timestamptz, 'medium', 'todo'),
      (e2, ws, uid, 'Apply for temporary event notice', 'compliance', (t + 60)::timestamptz, 'critical', 'todo'), (e3, ws, uid, 'Brief demo station staff', 'team', (t + 16)::timestamptz, 'medium', 'in_progress');
    insert into public.build_items(event_id, category, title, amount, status, role, sort) values
      (e1, 'catering', 'Three-course dinner for 280', 16800, 'confirmed', 'primary', 1), (e1, 'entertainment', 'Six-piece function band', 3200, 'held', 'primary', 2),
      (e1, 'production', 'Stage, lighting and PA', 5400, 'awaiting_payment', 'primary', 3), (e2, 'security', 'SIA stewarding team', 14500, 'draft', 'primary', 1);
    insert into public.leads(workspace_id, reference, name, client_name, contact_name, contact_email, event_type, stage, value, probability, expected_date, guests, source)
      values (ws, 'DEMO-L1', 'Spring Awards Dinner', 'Pennine Housing Group', 'Sam Patel', 'sam@example.com', 'awards', 'proposal', 28000, 60, t + 160, 220, 'referral'),
             (ws, 'DEMO-L2', 'Staff Summer Party', 'Northside Tech', 'Alex Morgan', 'alex@example.com', 'party', 'qualified', 12000, 40, t + 90, 150, 'website');
  else
    insert into public.listings(workspace_id, name, kind, category, description, city, price_from, price_unit, capacity_min, capacity_max, published, review_status, response_hours, booking_mode, tags, details)
      values (ws, case when p_persona = 'venue' then 'The Old Mill — Main Hall' else 'Feast & Co — Seasonal dining' end, case when p_persona = 'venue' then 'venue' else 'service' end,
        case when p_persona = 'venue' then 'venue' else 'catering' end,
        case when p_persona = 'venue' then 'Restored 1860s mill with exposed beams, river views and a 250-seat main hall.' else 'Seasonal menus from canapés to five-course dinners, with full allergen labelling.' end,
        'Manchester', case when p_persona = 'venue' then 2400 else 45 end, case when p_persona = 'venue' then 'day' else 'head' end, 20, 250,
        false, 'pending', 4, 'request', array[tag], jsonb_build_object('demo', true))
      returning id into venue;
    insert into public.events(owner_id, workspace_id, management, name, event_type, visibility, status, starts_at, ends_at, venue_name, city, guest_count, capacity, currency, tags, settings)
      values (uid, ws, 'professional', case when p_persona = 'venue' then 'Booked: Henderson Wedding' else 'Catering: Henderson Wedding' end, 'wedding', 'private', 'planning',
        (t + 30) + time '14:00', (t + 30) + time '23:00', 'The Old Mill', 'Manchester', 140, 160, 'GBP', array[tag], jsonb_build_object('demo', true)) returning id into e1;
    insert into public.tasks(event_id, workspace_id, owner_id, title, category, due_at, priority, status) values
      (e1, ws, uid, 'Confirm final numbers and dietary list', 'guests', (t + 23)::timestamptz, 'high', 'todo'),
      (e1, ws, uid, case when p_persona = 'venue' then 'Walk-through with the couple' else 'Tasting session' end, 'planning', (t + 10)::timestamptz, 'medium', 'todo');
  end if;
  insert into public.notifications(user_id, kind, title, body, link)
    values (uid, 'event_update', 'Your demo workspace is ready', 'Everything in it is sample data marked DEMO. Reset or delete it any time from Settings.', '/' || kind);
  insert into public.audit_events(actor_id, actor_type, workspace_id, event, metadata) values (uid, 'user', ws, 'demo.created', jsonb_build_object('persona', p_persona));
  return ws;
end $$;

create or replace function public.delete_demo_workspace(p_workspace uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace and w.owner_id = auth.uid() and coalesce((w.settings ->> 'demo')::boolean, false)) then
    raise exception 'not_a_demo_workspace' using errcode = '42501'; end if;
  -- Remove the demo's own records explicitly (events don't cascade from workspaces by design), then the workspace.
  delete from public.tasks where workspace_id = p_workspace or event_id in (select id from public.events where workspace_id = p_workspace);
  delete from public.ticket_tiers where event_id in (select id from public.events where workspace_id = p_workspace);
  delete from public.programme_items where event_id in (select id from public.events where workspace_id = p_workspace);
  delete from public.build_items where event_id in (select id from public.events where workspace_id = p_workspace);
  delete from public.events where workspace_id = p_workspace;
  delete from public.leads where workspace_id = p_workspace;
  delete from public.listings where workspace_id = p_workspace;
  delete from public.workspaces where id = p_workspace;
end $$;

create or replace function public.reset_demo_workspace(p_workspace uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare persona text;
begin
  select w.settings ->> 'demo_persona' into persona from public.workspaces w where w.id = p_workspace and w.owner_id = auth.uid() and coalesce((w.settings ->> 'demo')::boolean, false);
  if persona is null then raise exception 'not_a_demo_workspace' using errcode = '42501'; end if;
  perform public.delete_demo_workspace(p_workspace);
  return public.create_demo_workspace(persona);
end $$;
revoke all on function public.create_demo_workspace(text), public.delete_demo_workspace(uuid), public.reset_demo_workspace(uuid) from public, anon;
grant execute on function public.create_demo_workspace(text), public.delete_demo_workspace(uuid), public.reset_demo_workspace(uuid) to authenticated;
