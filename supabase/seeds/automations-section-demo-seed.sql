-- =============================================================================
-- GALA DOCK — Automations Section Demo Seed
-- Run in Supabase SQL Editor (one click → Run), or via scripts/db/apply-sql.mjs.
-- Self-contained: uses the first workspace and your account email.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING/UPDATE guards throughout.
-- =============================================================================

DO $$
DECLARE
  v_ws   uuid;
  v_user uuid;

  -- Automation (smart_rules) fixed UUIDs
  a1  uuid := '10000000-0000-4000-8000-000000000001'; -- Event confirmed -> onboarding checklist
  a2  uuid := '10000000-0000-4000-8000-000000000002'; -- Supplier doc expiring -> request renewal
  a3  uuid := '10000000-0000-4000-8000-000000000003'; -- Invoice overdue -> draft chase
  a4  uuid := '10000000-0000-4000-8000-000000000004'; -- Task overdue -> escalate
  a5  uuid := '10000000-0000-4000-8000-000000000005'; -- Check-in due -> reminder message
  a6  uuid := '10000000-0000-4000-8000-000000000006'; -- Post-event -> feedback request
  a7  uuid := '10000000-0000-4000-8000-000000000007'; -- Event cancelled -> notify suppliers
  a8  uuid := '10000000-0000-4000-8000-000000000008'; -- Ticket sales threshold -> alert manager
  a9  uuid := '10000000-0000-4000-8000-000000000009'; -- Run sheet updated -> notify production team
  a10 uuid := '10000000-0000-4000-8000-000000000010'; -- Deposit overdue -> escalate finance task
  a11 uuid := '10000000-0000-4000-8000-000000000011'; -- Tenancy ending -> review task (draft)
  a12 uuid := '10000000-0000-4000-8000-000000000012'; -- Payment received -> receipt + note
  a13 uuid := '10000000-0000-4000-8000-000000000013'; -- Inspection due -> schedule task (paused)
  a14 uuid := '10000000-0000-4000-8000-000000000014'; -- Compliance overdue -> notify + flag

  v1 uuid := '20000000-0000-4000-8000-000000000001';

  -- Approval fixed UUIDs
  ap1 uuid := '30000000-0000-4000-8000-000000000001';
  ap2 uuid := '30000000-0000-4000-8000-000000000002';
  ap3 uuid := '30000000-0000-4000-8000-000000000003';
  ap4 uuid := '30000000-0000-4000-8000-000000000004';
  ap5 uuid := '30000000-0000-4000-8000-000000000005';

  -- Error incident fixed UUIDs
  err1 uuid := '40000000-0000-4000-8000-000000000001';
  err2 uuid := '40000000-0000-4000-8000-000000000002';
  err3 uuid := '40000000-0000-4000-8000-000000000003';
  err4 uuid := '40000000-0000-4000-8000-000000000004';
  err5 uuid := '40000000-0000-4000-8000-000000000005';

  -- Integration connection fixed UUIDs
  ic_slack   uuid := '50000000-0000-4000-8000-000000000001';
  ic_stripe  uuid := '50000000-0000-4000-8000-000000000002';
  ic_sendgrid uuid := '50000000-0000-4000-8000-000000000003';
  ic_twilio  uuid := '50000000-0000-4000-8000-000000000004';
  ic_gcal    uuid := '50000000-0000-4000-8000-000000000005';
  ic_zapier  uuid := '50000000-0000-4000-8000-000000000006';
  ic_webhook uuid := '50000000-0000-4000-8000-000000000007';
  ic_rest    uuid := '50000000-0000-4000-8000-000000000008';

  wh_slack uuid := '60000000-0000-4000-8000-000000000001';

  run1 uuid := '70000000-0000-4000-8000-000000000001'; -- the failed "compliance renewal" run shown in Runs & Logs detail
  i integer;
  d date;
BEGIN
  -- ── resolve workspace & user ──────────────────────────────────────────────
  SELECT id INTO v_ws FROM public.workspaces LIMIT 1;
  SELECT id INTO v_user FROM auth.users WHERE email = 'jamahlthomas1996@gmail.com' LIMIT 1;
  IF v_user IS NULL THEN SELECT id INTO v_user FROM auth.users LIMIT 1; END IF;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'No workspace found — create a workspace first.'; END IF;

  -- ==========================================================================
  -- 1. AUTOMATIONS (smart_rules)
  -- ==========================================================================
  INSERT INTO public.smart_rules (
    id, workspace_id, name, description, trigger_kind, action_kind,
    trigger_params, action_params, conditions, enabled, dry_run,
    owner_user_id, created_by, status, module, environment, tags,
    complexity, recipe_id, definition_json, fire_count, last_fired_at, version
  ) VALUES
    (a1, v_ws, 'Event confirmed → onboarding checklist', 'Automatically create and assign onboarding checklist when an event is confirmed.',
     'event_stage_changed', 'create_task', '{"to_stage":"confirmed"}'::jsonb, '{"template":"onboarding"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'events', 'production', ARRAY['event operations'], 'easy', 'event-confirmed-onboarding',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Event Confirmed"},{"id":"n2","type":"action","label":"Create onboarding tasks"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     482, now() - interval '2 minutes', 3),
    (a2, v_ws, 'Supplier doc expiring → request renewal', 'Ask the supplier to re-upload expiring onboarding documents.',
     'file_uploaded', 'send_email', '{"kind":"expiry"}'::jsonb, '{"template":"renewal_request"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'suppliers', 'production', ARRAY['supplier compliance'], 'easy', 'supplier-doc-expiring-renewal',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Document Expiry"},{"id":"n2","type":"action","label":"Send renewal request"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     397, now() - interval '18 minutes', 2),
    (a3, v_ws, 'Invoice overdue → draft chase', 'Draft and send a polite payment reminder before escalating.',
     'invoice_overdue', 'send_email', '{"days_overdue":3}'::jsonb, '{"template":"payment_reminder"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'finance', 'production', ARRAY['finance'], 'medium', 'invoice-overdue-draft-chase',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Invoice Overdue"},{"id":"n2","type":"action","label":"Draft reminder"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     341, now() - interval '45 minutes', 4),
    (a4, v_ws, 'Task overdue → escalate', 'Notify the task owner and flag the task when it goes overdue.',
     'task_due_in', 'notify_user', '{"overdue":true}'::jsonb, '{"channel":"in_app"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'tasks', 'production', ARRAY['tasks'], 'medium', 'task-overdue-escalate',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Task Overdue"},{"id":"n2","type":"action","label":"Notify owner"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     288, now() - interval '1 hour', 2),
    (a5, v_ws, 'Check-in due → reminder message', 'Send a reminder before check-in is due.',
     'task_due_in', 'send_email', '{"kind":"checkin"}'::jsonb, '{"template":"checkin_reminder"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'communications', 'production', ARRAY['comms'], 'easy', 'checkin-due-reminder',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Check-in Due"},{"id":"n2","type":"action","label":"Send reminder"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     241, now() - interval '2 hours', 1),
    (a6, v_ws, 'Post-event → feedback request', 'Collect feedback after an event is completed.',
     'event_stage_changed', 'send_email', '{"to_stage":"completed"}'::jsonb, '{"template":"feedback_request"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'events', 'production', ARRAY['event operations'], 'easy', 'post-event-feedback-request',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Event Completed"},{"id":"n2","type":"action","label":"Send feedback survey"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     196, now() - interval '1 day', 1),
    (a7, v_ws, 'Event cancelled → notify suppliers', 'Notify all assigned suppliers when an event is cancelled.',
     'event_stage_changed', 'notify_user', '{"to_stage":"cancelled"}'::jsonb, '{"channel":"email"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'suppliers', 'production', ARRAY['supplier compliance'], 'medium', 'event-cancelled-notify-suppliers',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Event Cancelled"},{"id":"n2","type":"action","label":"Notify suppliers"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     34, now() - interval '3 days', 1),
    (a8, v_ws, 'Ticket sales threshold → alert manager', 'Alert the event manager when ticket sales fall below forecast.',
     'nightly_cron', 'notify_user', '{"threshold_pct":50}'::jsonb, '{"channel":"in_app"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'tickets', 'production', ARRAY['tickets'], 'medium', 'ticket-sales-threshold-alert',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Daily Schedule"},{"id":"n2","type":"action","label":"Alert manager"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     58, now() - interval '5 hours', 1),
    (a9, v_ws, 'Run sheet updated → notify production team', 'Notify production staff whenever the run sheet changes.',
     'event_stage_changed', 'notify_user', '{"kind":"run_sheet"}'::jsonb, '{"channel":"in_app"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'paused', 'staffing', 'production', ARRAY['staffing'], 'easy', 'run-sheet-updated-notify',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Record Updated"},{"id":"n2","type":"action","label":"Notify production"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     91, now() - interval '6 hours', 1),
    (a10, v_ws, 'Deposit overdue → escalate finance task', 'Escalate a finance follow-up task when a venue deposit is overdue.',
     'invoice_overdue', 'create_task', '{"kind":"deposit"}'::jsonb, '{"assignee":"finance_team"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'finance', 'production', ARRAY['finance'], 'medium', 'deposit-overdue-escalate',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Invoice Overdue"},{"id":"n2","type":"action","label":"Create finance task"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     19, now() - interval '1 day', 1),
    (a11, v_ws, 'Tenancy ending → review task', 'Create a task to review and decide on renewal.',
     'event_stage_changed', 'create_task', '{"kind":"renewal"}'::jsonb, '{"template":"renewal_review"}'::jsonb, '[]'::jsonb,
     false, true, v_user, v_user, 'draft', 'leasing', 'production', ARRAY['leasing'], 'easy', 'tenancy-ending-review-task',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Tenancy Ending"}],"edges":[]}'::jsonb,
     0, NULL, 1),
    (a12, v_ws, 'Payment received → receipt + note', 'Send a receipt and log a note when a payment is received.',
     'invoice_overdue', 'send_email', '{"kind":"receipt"}'::jsonb, '{"template":"receipt"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'finance', 'production', ARRAY['finance'], 'easy', 'payment-received-receipt',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Payment Received"},{"id":"n2","type":"action","label":"Send receipt"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     127, now() - interval '1 day', 1),
    (a13, v_ws, 'Inspection due → schedule task', 'Schedule an inspection task ahead of the due date.',
     'task_due_in', 'create_task', '{"kind":"inspection"}'::jsonb, '{"template":"inspection"}'::jsonb, '[]'::jsonb,
     false, false, v_user, v_user, 'paused', 'operations', 'production', ARRAY['operations'], 'medium', 'inspection-due-schedule-task',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Task Due"},{"id":"n2","type":"action","label":"Schedule inspection"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     41, now() - interval '2 days', 1),
    (a14, v_ws, 'Compliance overdue → notify + flag', 'Notify compliance owner and flag the record when a check fails.',
     'file_uploaded', 'notify_user', '{"kind":"compliance_overdue"}'::jsonb, '{"channel":"in_app"}'::jsonb, '[]'::jsonb,
     true, false, v_user, v_user, 'active', 'compliance', 'production', ARRAY['compliance'], 'medium', 'compliance-overdue-notify-flag',
     '{"nodes":[{"id":"n1","type":"trigger","label":"Compliance Check Failed"},{"id":"n2","type":"action","label":"Notify + flag"}],"edges":[{"from":"n1","to":"n2"}]}'::jsonb,
     12, now() - interval '9 hours', 1)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, module = EXCLUDED.module, tags = EXCLUDED.tags,
    definition_json = EXCLUDED.definition_json, fire_count = EXCLUDED.fire_count;

  -- ==========================================================================
  -- 2. AUTOMATION VERSIONS (one published version per active automation)
  -- ==========================================================================
  INSERT INTO public.automation_versions (id, workspace_id, automation_id, version_number, definition_json, schema_version, change_summary, status, checksum, created_by, approved_by, approved_at, published_by, published_at)
  SELECT v1, v_ws, a1, 1, sr.definition_json, 1, 'Initial published version', 'published', 'chk_' || substr(md5(a1::text), 1, 8), v_user, v_user, now() - interval '30 days', v_user, now() - interval '30 days'
  FROM public.smart_rules sr WHERE sr.id = a1
  ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- 3. RUN HISTORY — ~90 days of runs across all active automations
  -- ==========================================================================
  FOR i IN 0..119 LOOP
    INSERT INTO public.smart_rule_runs (
      id, rule_id, workspace_id, mode, status, matched_count, fired_count, skipped_dedupe_count,
      duration_ms, error_text, ts, started_at, trigger_source, environment, initiated_by, payload
    ) VALUES (
      ('71111111-1111-1111-1111-' || lpad(i::text, 12, '0'))::uuid,
      (ARRAY[a1,a2,a3,a4,a5,a6,a8,a10,a12,a14])[1 + (i % 10)],
      v_ws,
      'live',
      (ARRAY['success','success','success','success','success','success','success','success','failed','skipped'])[1 + (i % 10)]::smart_rule_run_status,
      1, 1, 0,
      40000 + (i * 733) % 180000,
      CASE WHEN i % 10 = 8 THEN 'Validation error: Due date cannot be in the past. Code: VALIDATION_DUE_DATE_PAST' ELSE NULL END,
      now() - (i || ' hours')::interval,
      now() - (i || ' hours')::interval,
      (ARRAY['scheduled','event','scheduled','scheduled','event'])[1 + (i % 5)],
      'production',
      CASE WHEN i % 7 = 0 THEN v_user ELSE NULL END,
      jsonb_build_object('trigger_type', 'record.created', 'module', 'events')
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- The specific failed run featured in the Runs & Logs detail panel + Errors screen.
  INSERT INTO public.smart_rule_runs (id, rule_id, workspace_id, mode, status, matched_count, fired_count, skipped_dedupe_count, duration_ms, error_text, ts, started_at, trigger_source, environment, initiated_by, payload)
  VALUES (run1, a14, v_ws, 'live', 'failed', 1, 0, 0, 222000, 'Validation error: Due date cannot be in the past. Code: VALIDATION_DUE_DATE_PAST', now() - interval '50 minutes', now() - interval '50 minutes', 'scheduled', 'production', NULL, '{"trigger_type":"compliance.expiring","module":"compliance"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, error_text = EXCLUDED.error_text;

  INSERT INTO public.smart_rule_actions_log (id, rule_id, run_id, workspace_id, action_kind, entity_kind, entity_id, success, error_text, payload_summary, ts, node_id, node_type, step_index, duration_ms, started_at)
  VALUES
    (gen_random_uuid(), a14, run1, v_ws, 'notify_user', 'compliance_record', gen_random_uuid(), true, NULL, '{"step":"Record Created"}'::jsonb, now() - interval '50 minutes', 'node_1', 'trigger', 0, 124, now() - interval '50 minutes'),
    (gen_random_uuid(), a14, run1, v_ws, 'notify_user', 'compliance_record', gen_random_uuid(), true, NULL, '{"step":"Fetch Compliance Items"}'::jsonb, now() - interval '50 minutes', 'node_2', 'condition', 1, 312, now() - interval '50 minutes'),
    (gen_random_uuid(), a14, run1, v_ws, 'notify_user', 'compliance_record', gen_random_uuid(), true, NULL, '{"step":"Evaluate Due Date"}'::jsonb, now() - interval '50 minutes', 'node_3', 'condition', 2, 85, now() - interval '50 minutes'),
    (gen_random_uuid(), a14, run1, v_ws, 'create_task', 'compliance_record', gen_random_uuid(), false, 'Validation Error: Due date cannot be in the past.', '{"step":"Create Renewal Task"}'::jsonb, now() - interval '50 minutes', 'node_4', 'action', 3, 2410, now() - interval '50 minutes')
  ON CONFLICT DO NOTHING;

  -- ==========================================================================
  -- 4. USAGE EVENTS — 30 days, for Overview + Usage & Limits charts
  -- ==========================================================================
  FOR i IN 0..29 LOOP
    d := (current_date - i);
    INSERT INTO public.automation_usage_events (id, workspace_id, automation_id, kind, module, quantity, created_at)
    VALUES
      (('72222222-2222-2222-2222-' || lpad((i*4+1)::text, 12, '0'))::uuid, v_ws, a1, 'run', 'events', 380 + (i * 37) % 260, d + interval '9 hours'),
      (('72222222-2222-2222-2222-' || lpad((i*4+2)::text, 12, '0'))::uuid, v_ws, a3, 'ai_credit', 'finance', 8 + (i * 3) % 20, d + interval '10 hours'),
      (('72222222-2222-2222-2222-' || lpad((i*4+3)::text, 12, '0'))::uuid, v_ws, a2, 'webhook_event', 'suppliers', 700 + (i * 53) % 900, d + interval '11 hours'),
      (('72222222-2222-2222-2222-' || lpad((i*4+4)::text, 12, '0'))::uuid, v_ws, a4, 'approval_task', 'tasks', 1 + (i % 4), d + interval '12 hours')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 5. APPROVAL REQUESTS
  -- ==========================================================================
  INSERT INTO public.approval_requests (id, workspace_id, automation_id, run_id, request_type, module, trigger_context, before_state, after_state, priority, status, reason, submitted_by, submitted_at, reviewer_id, due_at)
  VALUES
    (ap1, v_ws, a2, NULL, 'Document Renewal Approval', 'suppliers',
     '{"supplier":"ACME Facilities Ltd","supplier_code":"ACME-001","document_type":"Insurance Certificate","expiry_date":"2026-05-28"}'::jsonb,
     '{"Expiry Date":"May 28, 2025","Coverage":"£2,000,000","Insurer":"SafeCover Ltd","Policy Number":"PL-654321-2023","Document":"PLI_2024.pdf"}'::jsonb,
     '{"Expiry Date":"May 28, 2026","Coverage":"£5,000,000","Insurer":"SafeCover Ltd","Policy Number":"PL-789456-2024","Document":"PLI_2025.pdf"}'::jsonb,
     'high', 'pending', 'Insurance document is expiring in 14 days and requires renewal.', v_user, now() - interval '1 hour', v_user, now() + interval '7 hours 48 minutes'),
    (ap2, v_ws, a3, NULL, 'Payment Reminder Approval', 'finance',
     '{"invoice":"INV-2025-0481","tenant":"Skyline Retail"}'::jsonb, NULL, NULL,
     'medium', 'pending', 'Reminder ready to send to tenant.', v_user, now() - interval '2 hours', v_user, now() + interval '6 hours 48 minutes'),
    (ap3, v_ws, a11, NULL, 'Renewal Decision Approval', 'leasing',
     '{"unit":"Unit 12A","tenant":"Urban Coffee Co."}'::jsonb, NULL, NULL,
     'high', 'escalated', 'Renewal decision overdue — escalated to property manager.', v_user, now() - interval '2 hours', v_user, now() + interval '23 hours'),
    (ap4, v_ws, a13, NULL, 'Escalation Approval', 'tasks',
     '{"task":"Safety Inspection","owner":"Maintenance Team"}'::jsonb, NULL, NULL,
     'medium', 'pending', 'Task escalated after missed deadline.', v_user, now() - interval '3 hours', v_user, now() + interval '2 hours 48 minutes'),
    (ap5, v_ws, a5, NULL, 'Message Content Approval', 'communications',
     '{"event":"Gala Dinner 2026","recipient":"Exhibitors"}'::jsonb, NULL, NULL,
     'low', 'pending', 'Check-in reminder copy ready for review.', v_user, now() - interval '3 hours', v_user, now() + interval '1 hour 48 minutes')
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO public.approval_comments (id, workspace_id, approval_id, author_id, body, created_at)
  VALUES
    (gen_random_uuid(), v_ws, ap1, v_user, 'Please review the updated insurance certificate.', now() - interval '1 hour'),
    (gen_random_uuid(), v_ws, ap1, v_user, 'Coverage increase looks good. Confirm insurer rating remains AA-?', now() - interval '45 minutes'),
    (gen_random_uuid(), v_ws, ap1, v_user, 'Yes, rating is AA- (confirmed).', now() - interval '30 minutes')
  ON CONFLICT DO NOTHING;

  -- ==========================================================================
  -- 6. ERROR INCIDENTS
  -- ==========================================================================
  INSERT INTO public.automation_error_incidents (id, workspace_id, automation_id, fingerprint, title, message, severity, module, status, impact, node_id, node_type, stack_trace, payload_preview, suggested_fix, owner_id, first_seen_at, last_seen_at, occurrences)
  VALUES
    (err1, v_ws, a14, 'fp_db_timeout_finance', 'Database connection timeout', 'Failed to connect to PostgreSQL', 'critical', 'finance', 'open', 'high', 'n_7fb82b1c', 'action',
     E'Error: connect ETIMEDOUT 10.10.4.21:5432\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1607:16)\n    at TLSSocket.emit (node:events:513:28)\n    at TLSSocket.internal/streams/destroy:170:8)',
     '{"invoice_id":"inv_2025_5567","tenant_id":"prop_123456","amount_due":2450.00,"due_date":"2025-05-30","customer_id":"cust_98765"}'::jsonb,
     'This appears to be a transient database connectivity issue. Recommended actions: check database connectivity and firewall rules, verify connection pool settings, retry the automation.',
     v_user, now() - interval '10 hours', now() - interval '1 hour', 18),
    (err2, v_ws, a2, 'fp_api_rate_limit_suppliers', 'API rate limit exceeded', 'Too many requests to supplier API', 'warning', 'suppliers', 'open', 'medium', 'n_2a91cd3e', 'action', NULL,
     '{"supplier_id":"sup_4471"}'::jsonb, 'Add backoff/retry with jitter; reduce polling frequency.', v_user, now() - interval '11 hours', now() - interval '2 hours', 12),
    (err3, v_ws, a1, 'fp_webhook_payload_invalid_events', 'Webhook payload validation failed', 'Invalid payload structure', 'critical', 'events', 'open', 'high', 'n_9c12ff01', 'trigger', NULL,
     '{"event_id":"evt_8821"}'::jsonb, 'Verify upstream integration is sending the documented schema version.', v_user, now() - interval '12 hours', now() - interval '3 hours', 7),
    (err4, v_ws, a5, 'fp_smtp_mailbox_unavailable', 'Email delivery failed', 'SMTP 550 mailbox unavailable', 'warning', 'comms', 'open', 'low', 'n_5f0a7712', 'action', NULL,
     '{"recipient":"guest@example.com"}'::jsonb, 'Confirm recipient address; remove from list if bouncing repeatedly.', v_user, now() - interval '13 hours', now() - interval '4 hours', 21),
    (err5, v_ws, a4, 'fp_permission_denied_tasks', 'Task update permission denied', 'User does not have permission', 'warning', 'tasks', 'open', 'low', 'n_1b44e920', 'action', NULL,
     '{"task_id":"task_3391"}'::jsonb, 'Grant the automation service role write access to tasks, or narrow the action scope.', v_user, now() - interval '14 hours', now() - interval '5 hours', 4)
  ON CONFLICT (workspace_id, fingerprint) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, occurrences = EXCLUDED.occurrences;

  FOR i IN 1..18 LOOP
    INSERT INTO public.automation_error_occurrences (id, workspace_id, incident_id, occurred_at, message)
    VALUES (('73333333-3333-3333-3333-' || lpad(i::text, 12, '0'))::uuid, v_ws, err1, now() - (i || ' hours')::interval, 'connect ETIMEDOUT 10.10.4.21:5432')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- ==========================================================================
  -- 7. INTEGRATIONS
  -- ==========================================================================
  INSERT INTO public.integration_connections (id, workspace_id, provider, connect_type, status, environment, config, secret_last4, connected_by, connected_at, last_sync_at)
  VALUES
    (ic_slack, v_ws, 'slack', 'oauth', 'connected', 'production', '{"team":"Gala Dock"}'::jsonb, 'a1b2', v_user, now() - interval '60 days', now() - interval '2 minutes'),
    (ic_stripe, v_ws, 'stripe', 'oauth', 'connected', 'production', '{}'::jsonb, 'x9k2', v_user, now() - interval '55 days', now() - interval '5 minutes'),
    (ic_sendgrid, v_ws, 'email_provider', 'api_key', 'connected', 'production', '{}'::jsonb, 'q7m1', v_user, now() - interval '50 days', now() - interval '8 minutes'),
    (ic_twilio, v_ws, 'twilio', 'api_key', 'connected', 'production', '{}'::jsonb, 'p3z8', v_user, now() - interval '40 days', now() - interval '12 minutes'),
    (ic_gcal, v_ws, 'google_calendar', 'oauth', 'connected', 'production', '{}'::jsonb, 'c4d5', v_user, now() - interval '30 days', now() - interval '15 minutes'),
    (ic_zapier, v_ws, 'zapier', 'api_key', 'connected', 'production', '{}'::jsonb, 'z1a2', v_user, now() - interval '20 days', now() - interval '21 minutes'),
    (ic_webhook, v_ws, 'custom_webhook', 'api_key', 'connected', 'production', '{}'::jsonb, 'w9e0', v_user, now() - interval '10 days', now() - interval '1 minute'),
    (ic_rest, v_ws, 'rest_api', 'api_key', 'disconnected', 'production', '{}'::jsonb, NULL, NULL, NULL, NULL)
  ON CONFLICT (workspace_id, provider) DO UPDATE SET status = EXCLUDED.status, last_sync_at = EXCLUDED.last_sync_at;

  INSERT INTO public.integration_webhooks (id, workspace_id, connection_id, direction, endpoint_url, retry_policy, subscribed_events, status, created_by)
  VALUES (wh_slack, v_ws, ic_slack, 'outgoing', 'https://hooks.slack.example/services/DEMO_WORKSPACE/DEMO_BOT/demo-placeholder-not-a-real-token',
    '{"strategy":"exponential_backoff","max_retries":5,"initial_delay_ms":1000,"max_delay_ms":300000}'::jsonb,
    ARRAY['automation.run.succeeded','automation.run.failed','automation.run.cancelled','integration.delivery.failed'],
    'active', v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.integration_webhook_deliveries (id, workspace_id, webhook_id, event_type, status, response_code, attempt, payload, created_at)
  VALUES
    (gen_random_uuid(), v_ws, wh_slack, 'automation.run.succeeded', 'delivered', 200, 1, '{}'::jsonb, now() - interval '2 minutes'),
    (gen_random_uuid(), v_ws, wh_slack, 'automation.run.failed', 'delivered', 200, 1, '{}'::jsonb, now() - interval '6 minutes'),
    (gen_random_uuid(), v_ws, wh_slack, 'automation.run.cancelled', 'failed', 500, 5, '{}'::jsonb, now() - interval '12 minutes'),
    (gen_random_uuid(), v_ws, wh_slack, 'integration.delivery.failed', 'delivered', 200, 1, '{}'::jsonb, now() - interval '14 minutes')
  ON CONFLICT DO NOTHING;

  -- ==========================================================================
  -- 8. RECIPE FAVOURITES + USAGE (drives Recipes screen "Most Used")
  -- ==========================================================================
  INSERT INTO public.automation_recipe_favourites (id, workspace_id, user_id, recipe_id)
  VALUES
    (gen_random_uuid(), v_ws, v_user, 'event-confirmed-onboarding'),
    (gen_random_uuid(), v_ws, v_user, 'supplier-doc-expiring-renewal')
  ON CONFLICT (workspace_id, user_id, recipe_id) DO NOTHING;

  FOR i IN 1..482 LOOP
    INSERT INTO public.automation_recipe_usage (id, workspace_id, recipe_id, automation_id, actor_id, created_at)
    VALUES (('74444444-4444-4444-4444-' || lpad(i::text, 12, '0'))::uuid, v_ws, 'event-confirmed-onboarding', a1, v_user, now() - (i || ' hours')::interval)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

END $$;
