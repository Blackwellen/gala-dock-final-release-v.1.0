-- =============================================================================
-- Gala Dock — Event Manager Finance section demo seed.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING / re-runnable UPDATEs.
-- Target workspace: "Grannit Holdings" (045a53a6-d421-4836-bf9e-e7a5cf998834),
-- the existing demo workspace also used by the Sales/Suppliers/RFQ seeds.
--
-- Reuses six REAL existing events from that workspace (rather than inventing
-- a parallel event roster) and the existing supplier roster, so the new
-- Deposits / Supplier Payments / Wages & Hours / Ticket Sales / Cashflow tabs
-- show data that lines up with Sales, Suppliers and the event profile pages:
--   London Tech Summit 2026        (new_enquiry)
--   Theatre Gala Night             (confirmed)
--   Cascade Media Awards 2026      (confirmed)
--   NexGen Fintech Forum – Day 1   (in_delivery)
--   Bluewave Music Festival        (in_delivery)
--   Lynwood Charity Gala – Tonight (in_delivery)
--
-- All money in GBP minor units (pence). ⚠️ Dev/staging only.
-- =============================================================================

DO $$
DECLARE
  ws_id    uuid := '045a53a6-d421-4836-bf9e-e7a5cf998834';
  owner_id uuid := '81b8cf5e-8f46-485a-b5b1-58f51d6109d7';

  ev_tech      uuid := 'b0110844-6f6a-4cb4-8572-97efa613c76f'; -- London Tech Summit 2026
  ev_theatre   uuid := 'eeee0001-0000-0000-0000-000000000002'; -- Theatre Gala Night
  ev_cascade   uuid := 'eeee0001-0000-0000-0000-000000000019'; -- Cascade Media Awards 2026
  ev_nexgen    uuid := 'eeee0001-0000-0000-0000-000000000023'; -- NexGen Fintech Forum
  ev_bluewave  uuid := 'eeee0001-0000-0000-0000-000000000024'; -- Bluewave Music Festival
  ev_lynwood   uuid := 'eeee0001-0000-0000-0000-000000000025'; -- Lynwood Charity Gala

  sup_av       uuid := 'a001a001-0000-0000-0000-000000000001'; -- Apex AV Productions
  sup_decor    uuid := '89e90e01-7883-4b68-b98b-35c80f864c22'; -- Atelier Lumen Decor
  sup_music    uuid := '552fe6f1-2c56-45a7-b3ef-fdfeb8465c38'; -- Bassline Collective
  sup_av2      uuid := '6905bef0-4c23-4284-9393-96db47cc3299'; -- Decibel AV
  sup_security uuid := 'a001a001-0000-0000-0000-000000000004'; -- EventGuard Security
  sup_florist  uuid := 'a001a001-0000-0000-0000-000000000005'; -- Floral & Event Design Co.

  -- fixed ids for new rows (idempotent)
  dep1 uuid := 'de905001-0000-0000-0000-000000000001';
  dep2 uuid := 'de905001-0000-0000-0000-000000000002';
  dep3 uuid := 'de905001-0000-0000-0000-000000000003';
  dep4 uuid := 'de905001-0000-0000-0000-000000000004';
  dep5 uuid := 'de905001-0000-0000-0000-000000000005';
  dep6 uuid := 'de905001-0000-0000-0000-000000000006';

  bill1 uuid := 'b1115001-0000-0000-0000-000000000001';
  bill2 uuid := 'b1115001-0000-0000-0000-000000000002';
  bill3 uuid := 'b1115001-0000-0000-0000-000000000003';
  bill4 uuid := 'b1115001-0000-0000-0000-000000000004';
  bill5 uuid := 'b1115001-0000-0000-0000-000000000005';
  bill6 uuid := 'b1115001-0000-0000-0000-000000000006';

  inv1 uuid := '10f01ce1-0000-0000-0000-000000000001';
  inv2 uuid := '10f01ce1-0000-0000-0000-000000000002';
  inv3 uuid := '10f01ce1-0000-0000-0000-000000000003';
  inv4 uuid := '10f01ce1-0000-0000-0000-000000000004';
  inv5 uuid := '10f01ce1-0000-0000-0000-000000000005';
  inv6 uuid := '10f01ce1-0000-0000-0000-000000000006';

  tt_vip uuid := '71c40001-0000-0000-0000-000000000001';
  tt_ga  uuid := '71c40001-0000-0000-0000-000000000002';
  tt_eb  uuid := '71c40001-0000-0000-0000-000000000003';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = ws_id) THEN
    RAISE NOTICE 'Workspace % not found — skipping Finance demo seed.', ws_id;
    RETURN;
  END IF;

  -- ===========================================================================
  -- Link a few existing Sales proposals to real events (Quotes tab needs
  -- Event/Client context; proposals were seeded with event_id = NULL).
  -- ===========================================================================
  UPDATE public.proposals SET event_id = ev_theatre WHERE workspace_id = ws_id AND title = 'Theatre Gala Night Proposal' AND event_id IS NULL;
  UPDATE public.proposals SET event_id = ev_tech    WHERE workspace_id = ws_id AND title = 'Global Tech Conference Proposal' AND event_id IS NULL;

  -- ===========================================================================
  -- DEPOSITS (client deposits, venue retainers, bar deposits, security holds,
  -- final balance milestones) — event_deposits, extended with paid_cents.
  -- ===========================================================================
  INSERT INTO public.event_deposits (id, workspace_id, event_id, kind, label, amount_cents, paid_cents, currency, due_date, refundable, status, owner_id, created_by)
  VALUES
    (dep1, ws_id, ev_tech,     'client_deposit', 'Client deposit — London Tech Summit 2026', 3422500, 1711250, 'GBP', current_date + 8,  true,  'partial', owner_id, owner_id),
    (dep2, ws_id, ev_theatre,  'venue_hire',      'Venue retainer — Theatre Gala Night',       2139000, 1069500, 'GBP', current_date + 4,  false, 'partial', owner_id, owner_id),
    (dep3, ws_id, ev_bluewave, 'bar',             'Bar deposit — Bluewave Music Festival',     2000000, 2000000, 'GBP', current_date + 2,  true,  'paid',    owner_id, owner_id),
    (dep4, ws_id, ev_lynwood,  'security',        'Security hold — Lynwood Charity Gala',      1500000, 0,       'GBP', current_date - 1,  true,  'pending', owner_id, owner_id),
    (dep5, ws_id, ev_cascade,  'final_balance',   'Final balance — Cascade Media Awards 2026', 8870000, 4435000, 'GBP', current_date + 14, false, 'partial', owner_id, owner_id),
    (dep6, ws_id, ev_nexgen,   'client_deposit',  'Client deposit — NexGen Fintech Forum',     1260000, 630000,  'GBP', current_date + 6,  true,  'partial', owner_id, owner_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.event_deposit_payments (workspace_id, deposit_id, amount_cents, currency, method, paid_at, note, created_by)
  SELECT ws_id, dep1, 1711250, 'GBP', 'bank_transfer', now() - interval '5 days', 'First instalment', owner_id
  WHERE NOT EXISTS (SELECT 1 FROM public.event_deposit_payments WHERE deposit_id = dep1);
  INSERT INTO public.event_deposit_payments (workspace_id, deposit_id, amount_cents, currency, method, paid_at, note, created_by)
  SELECT ws_id, dep3, 2000000, 'GBP', 'card', now() - interval '10 days', 'Bar deposit paid in full', owner_id
  WHERE NOT EXISTS (SELECT 1 FROM public.event_deposit_payments WHERE deposit_id = dep3);

  -- ===========================================================================
  -- SUPPLIER BILLS (event_expenses w/ supplier_id = Accounts Payable ledger)
  -- ===========================================================================
  INSERT INTO public.event_expenses (id, workspace_id, event_id, description, category, amount_cents, paid_cents, currency, expense_date, due_date, bill_number, status, approval_status, payment_status, supplier_id, owner_id, created_by)
  VALUES
    (bill1, ws_id, ev_tech,     'AV rig + LED wall hire',        'AV',       2475000, 0,       'GBP', current_date - 6,  current_date - 2,  'BILL-2026-0142', 'approved', 'approved',            'unpaid',   sup_av,       owner_id, owner_id),
    (bill2, ws_id, ev_bluewave, 'Stage production crew',         'Staffing', 1584000, 0,       'GBP', current_date - 4,  current_date + 10, 'BILL-2026-0143', 'approved', 'approved',            'unpaid',   sup_music,    owner_id, owner_id),
    (bill3, ws_id, ev_lynwood,  'Security detail — 12 staff',    'Security',  960000, 960000,  'GBP', current_date - 12, current_date - 15, 'BILL-2026-0144', 'approved', 'approved',            'paid',     sup_security, owner_id, owner_id),
    (bill4, ws_id, ev_theatre,  'Stage decor & floral install',  'Decor',     625000, 0,       'GBP', current_date - 2,  current_date + 10, 'BILL-2026-0145', 'pending',  'pending_review',      'unpaid',   sup_florist,  owner_id, owner_id),
    (bill5, ws_id, ev_cascade,  'Broadcast AV package',          'AV',       1890000, 0,       'GBP', current_date - 1,  current_date + 7,  'BILL-2026-0146', 'approved', 'approved',            'unpaid',   sup_av2,      owner_id, owner_id),
    (bill6, ws_id, ev_nexgen,   'Stage lighting design',         'AV',        780000, 0,       'GBP', current_date - 20, current_date - 27, 'BILL-2026-0147', 'approved', 'approved',            'unpaid',   sup_av,       owner_id, owner_id)
  ON CONFLICT (id) DO NOTHING;

  -- Backfill AP columns on already-seeded supplier-linked expenses so the
  -- Supplier Payments tab has realistic volume beyond the 6 rows above.
  UPDATE public.event_expenses
  SET due_date        = COALESCE(due_date, expense_date + 21),
      bill_number     = COALESCE(bill_number, 'BILL-2026-' || lpad((100 + (('x' || substr(id::text, 1, 4))::bit(16)::int % 800))::text, 4, '0')),
      approval_status = CASE WHEN approval_status = 'approved' AND status = 'rejected' THEN 'rejected' ELSE approval_status END,
      payment_status  = CASE WHEN payment_status = 'unpaid' AND status = 'paid' THEN 'paid' ELSE payment_status END
  WHERE workspace_id = ws_id AND supplier_id IS NOT NULL AND due_date IS NULL;

  INSERT INTO public.event_expense_payments (workspace_id, expense_id, amount_cents, currency, method, paid_at, created_by)
  SELECT ws_id, bill3, 960000, 'GBP', 'bank_transfer', now() - interval '13 days', owner_id
  WHERE NOT EXISTS (SELECT 1 FROM public.event_expense_payments WHERE expense_id = bill3);

  -- ===========================================================================
  -- CLIENT INVOICES + PAYMENTS (invoices / invoice_line_items / invoice_payments)
  -- ===========================================================================
  INSERT INTO public.invoices (id, workspace_id, event_id, invoice_number, client_name, client_email, currency, subtotal_cents, tax_cents, total_cents, paid_cents, status, due_on, issued_on, created_by)
  VALUES
    (inv1, ws_id, ev_tech,     'INV-2026-0118', 'TechCorp Global Ltd',   'accounts@techcorpglobal.com', 'GBP', 5704167, 1140833, 6845000, 0,       'sent',      current_date + 30, current_date, owner_id),
    (inv2, ws_id, ev_theatre,  'INV-2026-0117', 'West End Trust',        'finance@westendtrust.org.uk', 'GBP', 3565000,  713000, 4278000, 1069500, 'partial',  current_date + 30, current_date - 4, owner_id),
    (inv3, ws_id, ev_bluewave, 'INV-2026-0116', 'Bluewave Festivals Ltd','ops@bluewavefest.co.uk',      'GBP', 4800000,  960000, 5760000, 5760000, 'paid',     current_date - 2,  current_date - 32, owner_id),
    (inv4, ws_id, ev_cascade,  'INV-2026-0115', 'Cascade Media Group',   'events@cascademedia.co.uk',   'GBP', 7391667, 1478333, 8870000, 4435000, 'partial',  current_date + 15, current_date - 6, owner_id),
    (inv5, ws_id, ev_nexgen,   'INV-2026-0114', 'NexGen Fintech Ltd',    'finance@nexgenfintech.io',    'GBP', 1050000,  210000, 1260000, 1260000, 'paid',     current_date - 4,  current_date - 34, owner_id),
    (inv6, ws_id, ev_lynwood,  'INV-2026-0110', 'Lynwood Charitable Trust','accounts@lynwoodtrust.org.uk','GBP',1870833, 374167, 2245000, 0,       'overdue',   current_date - 6,  current_date - 36, owner_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (workspace_id, invoice_id, description, quantity, unit_cost_cents, tax_rate_bps, position)
  SELECT ws_id, inv1, 'Event production package', 1, 5704167, 2000, 0
  WHERE NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = inv1);

  INSERT INTO public.invoice_payments (workspace_id, invoice_id, amount_cents, currency, method, status, paid_at)
  SELECT ws_id, inv2, 1069500, 'GBP', 'bank_transfer', 'succeeded', now() - interval '3 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.invoice_payments WHERE invoice_id = inv2);
  INSERT INTO public.invoice_payments (workspace_id, invoice_id, amount_cents, currency, method, status, paid_at)
  SELECT ws_id, inv3, 5760000, 'GBP', 'stripe', 'succeeded', now() - interval '30 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.invoice_payments WHERE invoice_id = inv3);
  INSERT INTO public.invoice_payments (workspace_id, invoice_id, amount_cents, currency, method, status, paid_at)
  SELECT ws_id, inv4, 4435000, 'GBP', 'card', 'succeeded', now() - interval '2 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.invoice_payments WHERE invoice_id = inv4);
  INSERT INTO public.invoice_payments (workspace_id, invoice_id, amount_cents, currency, method, status, paid_at)
  SELECT ws_id, inv5, 1260000, 'GBP', 'bank_transfer', 'succeeded', now() - interval '32 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.invoice_payments WHERE invoice_id = inv5);

  -- ===========================================================================
  -- TIMESHEETS / WAGES
  -- ===========================================================================
  INSERT INTO public.timesheets (workspace_id, event_id, team_member_name, role, department, pay_period_start, pay_period_end, scheduled_hours, actual_hours, overtime_hours, hourly_rate_cents, overtime_rate_cents, approval_status, approved_by, approved_at)
  SELECT * FROM (VALUES
    (ws_id, ev_tech,     'Liam Johnson',   'Technician',     'production',      current_date - 7, current_date, 10.0, 11.0, 1.0, 2800, 4200, 'pending',  NULL::uuid, NULL::timestamptz),
    (ws_id, ev_bluewave, 'Sophie Bennett', 'Bar Staff',      'front_of_house',  current_date - 7, current_date,  8.0,  8.0, 0.0, 1600, 2400, 'pending',  NULL,       NULL),
    (ws_id, ev_lynwood,  'Mason Clark',    'Security Lead',  'security',        current_date - 7, current_date, 12.0, 13.5, 1.5, 2600, 3900, 'approved', owner_id,  now() - interval '1 day'),
    (ws_id, ev_tech,     'Ella Harrison',  'Event Manager',  'operations',      current_date - 7, current_date,  9.0,  9.0, 0.0, 3200, 4800, 'approved', owner_id,  now() - interval '1 day'),
    (ws_id, ev_theatre,  'James Doyle',    'Lighting Operator','production',    current_date - 7, current_date, 10.0, 10.5, 0.5, 2400, 3600, 'pending',  NULL,       NULL),
    (ws_id, ev_nexgen,   'Amelia Hart',    'Host',           'front_of_house',  current_date - 7, current_date,  7.5,  7.5, 0.0, 1800, 2700, 'approved', owner_id,  now() - interval '2 days'),
    (ws_id, ev_cascade,  'Oliver White',   'Technician',     'production',      current_date - 7, current_date,  8.0,  9.0, 1.0, 2200, 3300, 'pending',  NULL,       NULL),
    (ws_id, ev_bluewave, 'Grace Kim',      'Bar Staff',      'front_of_house',  current_date - 7, current_date,  8.0,  8.0, 0.0, 1600, 2400, 'approved', owner_id,  now() - interval '1 day'),
    (ws_id, ev_lynwood,  'Noah Fisher',    'Security',       'security',        current_date - 7, current_date, 10.0, 10.0, 0.0, 2000, 3000, 'submitted',NULL,       NULL),
    (ws_id, ev_cascade,  'Isla Chapman',   'Event Manager',  'operations',      current_date - 7, current_date,  9.0,  9.5, 0.5, 3000, 4500, 'approved', owner_id,  now() - interval '3 days')
  ) AS v(workspace_id, event_id, team_member_name, role, department, pay_period_start, pay_period_end, scheduled_hours, actual_hours, overtime_hours, hourly_rate_cents, overtime_rate_cents, approval_status, approved_by, approved_at)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.timesheets t
    WHERE t.workspace_id = ws_id AND t.event_id = v.event_id AND t.team_member_name = v.team_member_name AND t.pay_period_start = v.pay_period_start
  );

  -- ===========================================================================
  -- TICKET SALES (ticket_types + ticket_orders — ticketed events only)
  -- ===========================================================================
  INSERT INTO public.ticket_types (id, workspace_id, event_id, name, price_cents, currency, quantity, sold, status)
  VALUES
    (tt_vip, ws_id, ev_bluewave, 'VIP',              9500, 'GBP', 500,  312, 'on_sale'),
    (tt_ga,  ws_id, ev_bluewave, 'General Admission',4500, 'GBP', 4000, 2860,'on_sale'),
    (tt_eb,  ws_id, ev_bluewave, 'Early Bird',       3500, 'GBP', 800,  800, 'sold_out')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ticket_orders (workspace_id, event_id, ticket_type_id, buyer_name, buyer_email, quantity, amount_cents, fee_cents, refunded_cents, currency, channel, status)
  SELECT * FROM (VALUES
    (ws_id, ev_bluewave, tt_vip, 'Liam Johnson',    'liam.j@example.com',   2, 19000, 1330, 0,    'GBP', 'website',      'paid'),
    (ws_id, ev_bluewave, tt_ga,  'Sophie Williams', 'sophie.w@example.com', 1,  4500,  315, 0,    'GBP', 'mobile_app',   'paid'),
    (ws_id, ev_bluewave, tt_eb,  'Alex Thompson',   'alex.t@example.com',   3, 10500,  735, 0,    'GBP', 'website',      'paid'),
    (ws_id, ev_bluewave, tt_ga,  'Mark Davies',     'mark.d@example.com',   2,  9000,  630, 4500, 'GBP', 'partner_sites','refunded'),
    (ws_id, ev_bluewave, tt_vip, 'Olivia Brown',    'olivia.b@example.com', 1,  9500,  665, 0,    'GBP', 'box_office',   'pending'),
    (ws_id, ev_bluewave, tt_ga,  'Daniel Roberts',  'daniel.r@example.com', 5, 22500, 1575, 0,    'GBP', 'website',      'paid')
  ) AS v(workspace_id, event_id, ticket_type_id, buyer_name, buyer_email, quantity, amount_cents, fee_cents, refunded_cents, currency, channel, status)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ticket_orders o
    WHERE o.workspace_id = ws_id AND o.ticket_type_id = v.ticket_type_id AND o.buyer_email = v.buyer_email
  );

  RAISE NOTICE 'Finance section demo seed complete for workspace %.', ws_id;
END $$;
