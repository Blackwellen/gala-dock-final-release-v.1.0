-- =============================================================================
-- Gala Dock — Supplier & RFQ section demo seed (Phase 2 seed for the 7-screen
-- supplier module rebuild). Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING /
-- re-runnable UPDATEs. Additive only — does not touch or delete any existing
-- supplier/event/RFQ rows.
--
-- Target workspace: "Grannit Holdings" (045a53a6-d421-4836-bf9e-e7a5cf998834),
-- the existing demo workspace. It already has 40 suppliers (some legacy
-- duplicate rows from earlier seed passes) and 12 supplier_categories, but
-- zero pause/archive lifecycle rows and zero RFQs — this file adds:
--   - document requirements per category (drives "Missing Documents")
--   - 12 paused suppliers (with supplier_pauses rows, one per pause reason
--     family from the reference images)
--   - 6 archived suppliers (with supplier_archives rows)
--   - enrichment (tier, coverage regions, insurance, documents) on the
--     existing 12 "clean" categorised suppliers + 9 previously-uncategorised
--     active suppliers, some deliberately left with missing/expiring documents
--   - compliance outreach history for the missing-documents suppliers
--   - per-user supplier stars (drives "Recently Used")
--   - 16 RFQs across all statuses, linked to real existing events, with
--     recipients, responses, line items and 3 awards
-- =============================================================================

DO $$
DECLARE
  ws_id uuid := '045a53a6-d421-4836-bf9e-e7a5cf998834';
  owner_id uuid := '81b8cf5e-8f46-485a-b5b1-58f51d6109d7';

  -- Existing category ids
  cat_catering uuid := '704dee0e-60e4-493f-9fc4-47c313970b37';
  cat_photo    uuid := '6b61f413-c0fc-42f7-a692-4e808bf15159';
  cat_video    uuid := '42a68f4b-5ab4-4479-9a4f-b668689db9c6';
  cat_florist  uuid := '8bb4ef5b-bab8-46bf-ab58-a005eb32d410';
  cat_venues   uuid := 'b8546171-176e-469a-8ba9-b1eb4c594d9a';
  cat_music    uuid := '87da4541-bc31-41f6-a63a-9f37165ff7fe';
  cat_lighting uuid := '35d517c2-76c6-4f79-86c7-c16f8c186691';
  cat_av       uuid := '90f089cd-45c3-46de-af8b-056e717cb71b';
  cat_decor    uuid := '75bcf3ef-ee4c-4070-aab0-aeb2fa818110';
  cat_transport uuid := '4ee64020-ac11-4743-b112-364d3cf3b419';
  cat_bar      uuid := '325adc7c-5dd9-4815-9951-daec38aafb5b';
  cat_security uuid := '19b947d1-3d5f-4817-a327-fba8c55afc3c';

  -- Existing "clean" suppliers (already categorised + have a contact)
  sup_atelier  uuid := '89e90e01-7883-4b68-b98b-35c80f864c22'; -- Atelier Lumen Decor
  sup_bassline uuid := '552fe6f1-2c56-45a7-b3ef-fdfeb8465c38'; -- Bassline Collective
  sup_decibel  uuid := '6905bef0-4c23-4284-9393-96db47cc3299'; -- Decibel AV
  sup_halo     uuid := 'b87aec61-53cf-48e9-b8ae-f0f4055bd630'; -- Halo Lighting Design
  sup_northlt  uuid := 'a43b8b19-9fef-499c-a1f2-313a4ca5b9cc'; -- North Light Studio
  sup_reelatlas uuid := '8aa7bd7c-1328-47bb-af61-54906b5cc8d9'; -- Reel Atlas Films
  sup_saffron  uuid := '662e7d4b-a374-4b2e-946e-b990a11eb03d'; -- Saffron & Smoke Catering
  sup_sentinel uuid := '176c13d4-ba81-4480-a4c9-ace1d81bff82'; -- Sentinel Event Security
  sup_silver   uuid := '2d412e35-4109-4eb2-b365-fcc66624c78e'; -- Silver Arrow Cars
  sup_copper   uuid := '62a20748-4a15-4aff-b694-665df13fec40'; -- The Copper Tap
  sup_oldmill  uuid := 'eb76ffaf-1a31-49fc-bd3f-c4a909b2ca4b'; -- The Old Mill Estate
  sup_wildflower uuid := '23984a86-8495-4cbc-96c1-b264487fcdce'; -- Wildflower & Stem

  -- Existing previously-uncategorised active suppliers, enriched here
  sup_eventure uuid := '7ee599dc-ab38-498b-8b8c-afd5c8dedfcc'; -- Eventure AV London
  sup_glow     uuid := '9a1e1418-11ab-4b76-a88a-ca31aa8ed68d'; -- Glow Lighting Design
  sup_greenfield uuid := '2a80b099-5316-483d-8ef7-8d6ae8dc34ed'; -- Greenfield Catering
  sup_highland uuid := '571d3439-2d90-441e-bf33-f60487aa2891'; -- Highland Catering Co.
  sup_maestro  uuid := '3c463488-e95d-4aed-857e-921ddd6018f2'; -- Maestro Entertainment
  sup_northstage uuid := 'e2248948-abb7-4766-82fc-51dc796a287e'; -- North Stage Events
  sup_premier  uuid := '71c4b68b-426a-40cc-8d46-06dfdde3cdf1'; -- Premier Security Scotland
  sup_stagenation uuid := '21026392-d594-45c2-b141-9434a16f183b'; -- Stage Nation
  sup_techsound uuid := 'f5381781-ab42-43a7-99d2-d7409571d97f'; -- TechSound AV

  -- New paused suppliers (fixed ids)
  p1 uuid := 'c0000001-0000-0000-0000-000000000001'; -- 360 Vision UK
  p2 uuid := 'c0000001-0000-0000-0000-000000000002'; -- Pixel & Light Ltd
  p3 uuid := 'c0000001-0000-0000-0000-000000000003'; -- Momentum Crew
  p4 uuid := 'c0000001-0000-0000-0000-000000000004'; -- Urban Storage Co.
  p5 uuid := 'c0000001-0000-0000-0000-000000000005'; -- Move It Logistics
  p6 uuid := 'c0000001-0000-0000-0000-000000000006'; -- Soundwave Events
  p7 uuid := 'c0000001-0000-0000-0000-000000000007'; -- Green Screen FX
  p8 uuid := 'c0000001-0000-0000-0000-000000000008'; -- ProTent Structures
  p9 uuid := 'c0000001-0000-0000-0000-000000000009'; -- Cater+Co
  p10 uuid := 'c0000001-0000-0000-0000-000000000010'; -- Aerial Capture UK
  p11 uuid := 'c0000001-0000-0000-0000-000000000011'; -- Loop Crew Solutions
  p12 uuid := 'c0000001-0000-0000-0000-000000000012'; -- Festi Supply Co.

  -- New archived suppliers
  a1 uuid := 'c0000002-0000-0000-0000-000000000001'; -- Lux Lighting Design
  a2 uuid := 'c0000002-0000-0000-0000-000000000002'; -- Bloom Floral & Decor
  a3 uuid := 'c0000002-0000-0000-0000-000000000003'; -- Moments Photography
  a4 uuid := 'c0000002-0000-0000-0000-000000000004'; -- Sonic DJ Collective
  a5 uuid := 'c0000002-0000-0000-0000-000000000005'; -- StagePro Structures
  a6 uuid := 'c0000002-0000-0000-0000-000000000006'; -- Streamline AV (Webcast)

  -- Real existing events to link RFQs to
  ev_hartwell    uuid := '19b0df3c-1434-4d22-b14a-f4fc5985ba1e'; -- Hartwell Wedding
  ev_northwind   uuid := 'b9e98b69-8200-43ce-aa75-26f956830a50'; -- Northwind Product Launch
  ev_kpmg        uuid := 'a5d17f8c-a956-4726-8c63-f7c0ccf2f399'; -- KPMG Innovation Summit
  ev_afterdark   uuid := 'eeee0001-0000-0000-0000-000000000005'; -- After Dark Club Night
  ev_riverside   uuid := 'eeee0001-0000-0000-0000-000000000003'; -- Riverside Food Festival 2026
  ev_theatre     uuid := 'eeee0001-0000-0000-0000-000000000002'; -- Theatre Gala Night
  ev_mason40     uuid := 'd187247e-9e3b-4e92-8493-500155be59e4'; -- Mason 40th Birthday
  ev_sandhu      uuid := 'b337eab4-c408-49b5-a5b1-d27dfe57b9b0'; -- Sandhu Sangeet & Reception
  ev_hartley     uuid := '837bc30b-3153-46ed-a955-26af5783fd6f'; -- Hartley & Young Centenary Gala
  ev_meridian    uuid := 'e4791dc2-58bd-4383-85a3-7a9b1ec98e05'; -- Meridian Corporate Gala 2026

  -- RFQ ids
  r1 uuid := 'd0000001-0000-0000-0000-000000000001'; -- Elegant Garden Wedding
  r2 uuid := 'd0000001-0000-0000-0000-000000000002'; -- Private Birthday Party
  r3 uuid := 'd0000001-0000-0000-0000-000000000003'; -- Annual Sales Conference
  r4 uuid := 'd0000001-0000-0000-0000-000000000004'; -- Product Launch Webinar
  r5 uuid := 'd0000001-0000-0000-0000-000000000005'; -- VIP Nightclub Event
  r6 uuid := 'd0000001-0000-0000-0000-000000000006'; -- Summer Music Festival
  r7 uuid := 'd0000001-0000-0000-0000-000000000007'; -- West End Theatre Show
  r8 uuid := 'd0000001-0000-0000-0000-000000000008'; -- Live Band Gig
  r9 uuid := 'd0000001-0000-0000-0000-000000000009'; -- Luxury Asian Wedding
  r10 uuid := 'd0000001-0000-0000-0000-000000000010'; -- Leadership Offsite
  r11 uuid := 'd0000001-0000-0000-0000-000000000011'; -- Centenary Gala Production
  r12 uuid := 'd0000001-0000-0000-0000-000000000012'; -- Corporate Gala Dinner AV
  r13 uuid := 'd0000001-0000-0000-0000-000000000013'; -- Food Festival Vendor Power
  r14 uuid := 'd0000001-0000-0000-0000-000000000014'; -- Nightclub Security Detail
  r15 uuid := 'd0000001-0000-0000-0000-000000000015'; -- Sangeet Decor & Lighting
  r16 uuid := 'd0000001-0000-0000-0000-000000000016'; -- Birthday Catering & Bar

BEGIN

  -- Whole-seed idempotency guard: several tables below (supplier_files,
  -- rfq_responses, rfq_response_line_items, supplier_compliance_outreach) have
  -- no natural unique key beyond their random PK, so ON CONFLICT DO NOTHING
  -- alone would duplicate rows on a second run. r16 is a fixed id created only
  -- at the very end of this block, so its presence means the whole seed
  -- already ran to completion.
  IF EXISTS (SELECT 1 FROM public.rfqs WHERE id = 'd0000001-0000-0000-0000-000000000016') THEN
    RAISE NOTICE 'Supplier/RFQ demo seed already applied — skipping.';
    RETURN;
  END IF;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Document requirements per category
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.supplier_document_requirements (workspace_id, category_id, document_type, is_required, default_risk_level) VALUES
  (ws_id, cat_av,       'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_av,       'RAMS',                       true, 'high'),
  (ws_id, cat_av,       'Equipment Test Certificate', true, 'medium'),
  (ws_id, cat_lighting, 'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_lighting, 'RAMS',                       true, 'high'),
  (ws_id, cat_lighting, 'Installation Certificate',   true, 'medium'),
  (ws_id, cat_catering, 'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_catering, 'Food Hygiene Certificate',   true, 'high'),
  (ws_id, cat_catering, 'Allergen Policy',            true, 'medium'),
  (ws_id, cat_security, 'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_security, 'DBS Checks',                 true, 'critical'),
  (ws_id, cat_security, 'Security Licence',           true, 'high'),
  (ws_id, cat_music,    'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_music,    'PPL/PRS Licence',            true, 'medium'),
  (ws_id, cat_photo,    'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_photo,    'Equipment Test Certificate', false, 'low'),
  (ws_id, cat_video,    'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_video,    'Equipment Test Certificate', false, 'low'),
  (ws_id, cat_florist,  'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_decor,    'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_decor,    'RAMS',                       true, 'medium'),
  (ws_id, cat_venues,   'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_venues,   'Fire Safety Certificate',    true, 'high'),
  (ws_id, cat_transport,'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_transport,'Driver DBS Checks',          true, 'high'),
  (ws_id, cat_bar,      'Public Liability Insurance', true, 'critical'),
  (ws_id, cat_bar,      'Personal Licence',           true, 'high')
ON CONFLICT (workspace_id, category_id, document_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Enrich existing "clean" categorised suppliers: tier, coverage, insurance
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.suppliers SET tier = 'premium',  coverage_regions = ARRAY['London','SE','M25'], insurance_expiry = '2026-08-18', last_used_at = now() - interval '6 days'  WHERE id = sup_atelier;
UPDATE public.suppliers SET tier = 'premium',  coverage_regions = ARRAY['London','SE','M25'], insurance_expiry = '2026-11-03', last_used_at = now() - interval '4 days'  WHERE id = sup_bassline;
UPDATE public.suppliers SET tier = 'verified', coverage_regions = ARRAY['UK Wide'],           insurance_expiry = '2026-07-22', last_used_at = now() - interval '2 days'  WHERE id = sup_decibel;
UPDATE public.suppliers SET tier = 'premium',  coverage_regions = ARRAY['Nationwide'],        insurance_expiry = '2026-09-05', last_used_at = now() - interval '9 days'  WHERE id = sup_halo;
UPDATE public.suppliers SET tier = 'preferred',coverage_regions = ARRAY['Nationwide'],        insurance_expiry = '2026-10-14', last_used_at = now() - interval '11 days' WHERE id = sup_northlt;
UPDATE public.suppliers SET tier = 'preferred',coverage_regions = ARRAY['UK Wide'],           insurance_expiry = '2026-09-27', last_used_at = now() - interval '20 days' WHERE id = sup_reelatlas;
UPDATE public.suppliers SET tier = 'premium',  coverage_regions = ARRAY['London','SE','SW'],  insurance_expiry = '2026-08-30', last_used_at = now() - interval '3 days'  WHERE id = sup_saffron;
UPDATE public.suppliers SET tier = 'verified', coverage_regions = ARRAY['UK Wide'],           insurance_expiry = '2026-07-18', last_used_at = now() - interval '5 days'  WHERE id = sup_sentinel;
UPDATE public.suppliers SET tier = 'verified', coverage_regions = ARRAY['London','SE'],       insurance_expiry = '2026-12-01', last_used_at = now() - interval '15 days' WHERE id = sup_silver;
UPDATE public.suppliers SET tier = 'preferred',coverage_regions = ARRAY['London'],            insurance_expiry = '2026-08-09', last_used_at = now() - interval '8 days'  WHERE id = sup_copper;
UPDATE public.suppliers SET tier = 'verified', coverage_regions = ARRAY['South East'],        insurance_expiry = '2026-10-30', last_used_at = now() - interval '30 days' WHERE id = sup_oldmill;
UPDATE public.suppliers SET tier = 'preferred',coverage_regions = ARRAY['London','Home Counties'], insurance_expiry = '2026-06-10', last_used_at = now() - interval '17 days' WHERE id = sup_wildflower;

-- Approved documents for these (fulfils every requirement -> "Complete" in the Documents column)
INSERT INTO public.supplier_files (workspace_id, supplier_id, kind, document_type, filename, storage_path, review_status, risk_level, issue_date, due_date, uploaded_by)
SELECT ws_id, s.id, 'cert', r.document_type,
  r.document_type || '.pdf',
  'workspaces/' || ws_id || '/suppliers/' || s.id || '/documents/' || replace(lower(r.document_type), ' ', '-') || '.pdf',
  'approved', 'compliant', now() - interval '200 days', now() + interval '160 days', owner_id
FROM public.suppliers s
JOIN public.supplier_document_requirements r ON r.category_id = s.category_id AND r.workspace_id = ws_id
WHERE s.id IN (sup_atelier, sup_bassline, sup_decibel, sup_halo, sup_northlt, sup_reelatlas, sup_saffron, sup_sentinel, sup_silver, sup_copper, sup_oldmill, sup_wildflower)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Enrich previously-uncategorised actives — assign categories; some are
--    deliberately left with incomplete documents to populate "Missing Documents"
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.suppliers SET category_id = cat_av,       tier = 'preferred', coverage_regions = ARRAY['London','SE','M25'], insurance_expiry = '2026-05-12', last_used_at = now() - interval '58 days' WHERE id = sup_eventure;
UPDATE public.suppliers SET category_id = cat_lighting,  tier = 'preferred', coverage_regions = ARRAY['UK Wide'],          insurance_expiry = '2026-07-19', last_used_at = now() - interval '12 days' WHERE id = sup_glow;
UPDATE public.suppliers SET category_id = cat_catering,  tier = 'verified',  coverage_regions = ARRAY['London','SE'],      insurance_expiry = NULL,          last_used_at = now() - interval '1 day'   WHERE id = sup_greenfield;
UPDATE public.suppliers SET category_id = cat_catering,  tier = NULL,        coverage_regions = ARRAY['Scotland'],         insurance_expiry = '2026-08-01', last_used_at = now() - interval '96 days' WHERE id = sup_highland;
UPDATE public.suppliers SET category_id = cat_music,     tier = 'verified',  coverage_regions = ARRAY['London','SE','SW'], insurance_expiry = '2026-07-31', last_used_at = now() - interval '3 days'  WHERE id = sup_maestro;
UPDATE public.suppliers SET category_id = cat_av,        tier = NULL,        coverage_regions = ARRAY['Scotland'],         insurance_expiry = NULL,          last_used_at = now() - interval '134 days' WHERE id = sup_northstage;
UPDATE public.suppliers SET category_id = cat_security,  tier = 'verified',  coverage_regions = ARRAY['Scotland'],         insurance_expiry = '2026-07-25', last_used_at = now() - interval '19 days' WHERE id = sup_premier;
UPDATE public.suppliers SET category_id = cat_music,     tier = 'preferred', coverage_regions = ARRAY['London'],           insurance_expiry = '2026-09-14', last_used_at = now() - interval '7 days'  WHERE id = sup_stagenation;
UPDATE public.suppliers SET category_id = cat_av,        tier = NULL,        coverage_regions = ARRAY['London','SE'],      insurance_expiry = '2026-07-16', last_used_at = now() - interval '2 days'  WHERE id = sup_techsound;

-- Only partial/absent documents for these nine -> drives the Missing Documents screen.
-- Eventure AV London: overdue Public Liability Insurance (insurance_expiry already past -> handled by app logic), missing RAMS
INSERT INTO public.supplier_files (workspace_id, supplier_id, kind, document_type, filename, storage_path, review_status, risk_level, issue_date, due_date, uploaded_by) VALUES
  (ws_id, sup_eventure, 'cert', 'Equipment Test Certificate', 'equipment-test-certificate.pdf', 'workspaces/'||ws_id||'/suppliers/'||sup_eventure||'/documents/equipment-test-certificate.pdf', 'approved', 'compliant', now() - interval '300 days', now() + interval '65 days', owner_id),
  (ws_id, sup_glow,     'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||sup_glow||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '250 days', now() + interval '9 days', owner_id),
  (ws_id, sup_maestro,  'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||sup_maestro||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '180 days', now() + interval '21 days', owner_id),
  (ws_id, sup_premier,  'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||sup_premier||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '200 days', now() + interval '15 days', owner_id),
  (ws_id, sup_premier,  'cert', 'DBS Checks',                 'dbs-checks.pdf',                 'workspaces/'||ws_id||'/suppliers/'||sup_premier||'/documents/dbs-checks.pdf', 'under_review', 'high', now() - interval '10 days', now() - interval '4 days', owner_id),
  (ws_id, sup_stagenation, 'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||sup_stagenation||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '260 days', now() + interval '65 days', owner_id),
  (ws_id, sup_techsound, 'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||sup_techsound||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '220 days', now() + interval '6 days', owner_id)
ON CONFLICT DO NOTHING;
-- (sup_greenfield, sup_highland, sup_northstage deliberately have zero documents -> "0/N" missing)

-- Compliance outreach / chaser history for the missing-documents suppliers
INSERT INTO public.supplier_compliance_outreach (workspace_id, supplier_id, document_type, status, channel, sent_at, note, created_by) VALUES
  (ws_id, sup_eventure,   'RAMS', 'request_sent', 'email', now() - interval '7 days', 'First request sent, no reply yet.', owner_id),
  (ws_id, sup_greenfield, 'Food Hygiene Certificate', 'awaiting_response', 'email', now() - interval '3 days', 'Supplier confirmed by phone they will upload this week.', owner_id),
  (ws_id, sup_highland,   'Public Liability Insurance', 'not_contacted', 'email', NULL, NULL, owner_id),
  (ws_id, sup_maestro,    'PPL/PRS Licence', 'email_opened', 'email', now() - interval '2 days', 'Reminder opened, awaiting upload.', owner_id),
  (ws_id, sup_northstage, 'Public Liability Insurance', 'escalated', 'email', now() - interval '1 day', 'No response after two reminders — escalated to account manager.', owner_id),
  (ws_id, sup_premier,    'DBS Checks', 'under_review', 'portal', now() - interval '4 days', 'Uploaded, pending compliance review.', owner_id),
  (ws_id, sup_stagenation,'PPL/PRS Licence', 'reminder_sent', 'email', now() - interval '5 days', NULL, owner_id),
  (ws_id, sup_techsound,  'RAMS', 'request_sent', 'email', now() - interval '1 day', NULL, owner_id)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Twelve paused suppliers, one per pause-reason family
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.suppliers (id, workspace_id, name, status, category_id, tier, coverage_regions, primary_email, last_used_at) VALUES
  (p1,  ws_id, '360 Vision UK',        'paused', cat_video,    'verified',  ARRAY['Nationwide'],       'oliver@360vision.co.uk',       now() - interval '205 days'),
  (p2,  ws_id, 'Pixel & Light Ltd',    'paused', cat_lighting, 'preferred', ARRAY['UK Wide'],           'sophie@pixellight.co.uk',      now() - interval '183 days'),
  (p3,  ws_id, 'Momentum Crew',        'paused', cat_av,       NULL,        ARRAY['London','SE'],       'marcus@momentumcrew.co.uk',    now() - interval '77 days'),
  (p4,  ws_id, 'Urban Storage Co.',    'paused', cat_transport,NULL,        ARRAY['London'],             'daniel@urbanstorage.co.uk',    now() - interval '227 days'),
  (p5,  ws_id, 'Move It Logistics',    'paused', cat_transport,'verified',  ARRAY['UK Wide'],            'natalie@moveitlogistics.co.uk',now() - interval '59 days'),
  (p6,  ws_id, 'Soundwave Events',     'paused', cat_av,       NULL,        ARRAY['London','SE','SW'],   'tom@soundwaveevents.co.uk',    now() - interval '90 days'),
  (p7,  ws_id, 'Green Screen FX',      'paused', cat_video,    NULL,        ARRAY['Nationwide'],          'laura@greenscreenfx.co.uk',    now() - interval '236 days'),
  (p8,  ws_id, 'ProTent Structures',   'paused', cat_venues,   'verified',  ARRAY['UK Wide'],             'chris@protentstructures.co.uk',now() - interval '65 days'),
  (p9,  ws_id, 'Cater+Co',             'paused', cat_catering, 'preferred', ARRAY['London','Home Counties'],'emily@caterandco.co.uk',    now() - interval '73 days'),
  (p10, ws_id, 'Aerial Capture UK',    'paused', cat_photo,    NULL,        ARRAY['UK Wide'],             'jake@aerialcaptureuk.co.uk',   now() - interval '162 days'),
  (p11, ws_id, 'Loop Crew Solutions',  'paused', cat_av,       'preferred', ARRAY['Nationwide'],          'rachel@loopcrew.co.uk',        now() - interval '256 days'),
  (p12, ws_id, 'Festi Supply Co.',     'paused', cat_decor,    NULL,        ARRAY['UK Wide'],             'ben@festisupply.co.uk',        now() - interval '100 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.supplier_pauses (workspace_id, supplier_id, reason, reason_detail, note, paused_at, paused_by) VALUES
  (ws_id, p1,  'low_utilisation',       'Not used in 180+ days',    'Consider before peak season.',              now() - interval '92 days',  owner_id),
  (ws_id, p2,  'seasonal',              'Seasonal / out of season', '3 documents missing: insurance, RAMS, PLI.', now() - interval '46 days',  owner_id),
  (ws_id, p3,  'project_complete',      'Project concluded',        'Great to re-engage for future stadium events.', now() - interval '86 days', owner_id),
  (ws_id, p4,  'low_utilisation',       'Not used in 180+ days',    'Expired insurance, awaiting renewal.',      now() - interval '44 days',  owner_id),
  (ws_id, p5,  'capacity_constraints',  'At capacity / unavailable','High demand period. Reassess in Q3.',       now() - interval '49 days',  owner_id),
  (ws_id, p6,  'strategic_review',      'Under performance review', 'Performance review in progress.',           now() - interval '55 days',  owner_id),
  (ws_id, p7,  'low_utilisation',       'Not used in 180+ days',    'Update documents to reactivate.',           now() - interval '59 days',  owner_id),
  (ws_id, p8,  'supplier_consolidation','Consolidating suppliers',  'Successful delivery. Archive if not needed.', now() - interval '73 days', owner_id),
  (ws_id, p9,  'project_complete',      'Project concluded',        'May be reactivated for summer season.',     now() - interval '65 days',  owner_id),
  (ws_id, p10, 'regulatory_hold',       'Compliance issue',         'Expired PLI insurance — hold until resolved.', now() - interval '79 days', owner_id),
  (ws_id, p11, 'low_utilisation',       'Not used in 180+ days',    'Refresh compliance and reassess need.',     now() - interval '87 days',  owner_id),
  (ws_id, p12, 'seasonal',              'Seasonal / out of season', 'Reactivate ahead of festival season.',      now() - interval '100 days', owner_id)
ON CONFLICT DO NOTHING;

-- Partial documents on paused suppliers (some fully compliant, some with real gaps)
INSERT INTO public.supplier_files (workspace_id, supplier_id, kind, document_type, filename, storage_path, review_status, risk_level, issue_date, due_date, uploaded_by) VALUES
  (ws_id, p1, 'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||p1||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '200 days', now() + interval '90 days', owner_id),
  (ws_id, p3, 'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||p3||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '150 days', now() + interval '120 days', owner_id),
  (ws_id, p5, 'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||p5||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '150 days', now() + interval '150 days', owner_id),
  (ws_id, p8, 'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||p8||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '180 days', now() + interval '200 days', owner_id),
  (ws_id, p9, 'cert', 'Public Liability Insurance', 'public-liability-insurance.pdf', 'workspaces/'||ws_id||'/suppliers/'||p9||'/documents/public-liability-insurance.pdf', 'approved', 'compliant', now() - interval '170 days', now() + interval '210 days', owner_id)
ON CONFLICT DO NOTHING;
-- p2, p4, p6, p7, p10, p11, p12 deliberately left with missing/expired documents.

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Six archived suppliers
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.suppliers (id, workspace_id, name, status, category_id, tier, coverage_regions, primary_email, last_used_at, archived_at) VALUES
  (a1, ws_id, 'Lux Lighting Design',      'archived', cat_lighting, 'premium',  ARRAY['Nationwide'],       'sophie@luxlighting.co.uk', now() - interval '90 days',  now() - interval '65 days'),
  (a2, ws_id, 'Bloom Floral & Decor',     'archived', cat_florist,  'preferred',ARRAY['London','Home Counties'], 'ella@bloomdecor.co.uk', now() - interval '103 days', now() - interval '77 days'),
  (a3, ws_id, 'Moments Photography',      'archived', cat_photo,    'preferred',ARRAY['Nationwide'],       'chloe@momentsphoto.co.uk', now() - interval '111 days', now() - interval '95 days'),
  (a4, ws_id, 'Sonic DJ Collective',      'archived', cat_music,    'premium',  ARRAY['London','SE','M25'],'nate@sonicdj.co.uk',       now() - interval '122 days', now() - interval '108 days'),
  (a5, ws_id, 'StagePro Structures',      'archived', cat_venues,   'verified', ARRAY['UK Wide'],           'henry@stagepro.co.uk',     now() - interval '144 days', now() - interval '131 days'),
  (a6, ws_id, 'Streamline AV (Webcast)',  'archived', cat_av,       'premium',  ARRAY['Global'],            'ethan@streamlineav.co.uk', now() - interval '166 days', now() - interval '187 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.supplier_archives (workspace_id, supplier_id, previous_category_id, previous_tier, reason, reason_detail, archived_by, archived_at, can_be_restored, retention_until) VALUES
  (ws_id, a1, cat_lighting, 'premium',  'business_closed',            'Company no longer trading',  owner_id, now() - interval '65 days',  true,  (now() + interval '6 years')::date),
  (ws_id, a2, cat_florist,  'preferred','out_of_business',            'Ceased operations',          owner_id, now() - interval '77 days',  true,  (now() + interval '6 years')::date),
  (ws_id, a3, cat_photo,    'preferred','no_longer_working_with_us',  'Strategic realignment',      owner_id, now() - interval '95 days',  true,  (now() + interval '6 years')::date),
  (ws_id, a4, cat_music,    'premium',  'performance_issues',         'Consistent quality concerns',owner_id, now() - interval '108 days', true,  (now() + interval '6 years')::date),
  (ws_id, a5, cat_venues,   'verified', 'duplicate_supplier',         'Merged with another supplier',owner_id, now() - interval '131 days', true, (now() + interval '6 years')::date),
  (ws_id, a6, cat_av,       'premium',  'contract_ended',             'Engagement concluded',       owner_id, now() - interval '187 days', false, (now() + interval '6 years')::date)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Recently-used favouriting (star toggle) for the demo owner
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.supplier_stars (workspace_id, supplier_id, user_id)
SELECT ws_id, s, owner_id FROM unnest(ARRAY[
  sup_atelier, sup_bassline, sup_decibel, sup_halo, sup_northlt, sup_reelatlas,
  sup_saffron, sup_sentinel, sup_silver, sup_copper
]) AS s
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RFQs — full lifecycle spread across all statuses
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.rfqs (id, workspace_id, event_id, title, category, status, due_date, response_deadline, budget_low_cents, budget_high_cents, currency, created_by) VALUES
  (r1,  ws_id, ev_hartwell,  'Elegant Garden Wedding',       'Wedding',            'responses_received', (now() + interval '10 days')::date, now() + interval '10 days', 850000, 1425000, 'GBP', owner_id),
  (r2,  ws_id, ev_mason40,   'Private Birthday Party',       'Private Party',      'responses_received', (now() - interval '2 days')::date, now() - interval '2 days', 320000, 680000, 'GBP', owner_id),
  (r3,  ws_id, ev_kpmg,      'Annual Sales Conference',      'Corporate Conference','under_review', (now() - interval '5 days')::date, now() - interval '5 days', 3200000, 6850000, 'GBP', owner_id),
  (r4,  ws_id, ev_northwind, 'Product Launch Webinar',       'Webinar',            'sent', (now() + interval '3 days')::date, now() + interval '3 days', 120000, 350000, 'GBP', owner_id),
  (r5,  ws_id, ev_afterdark, 'VIP Nightclub Event',          'Nightclub',          'responses_received', now()::date, now() + interval '18 hours', 600000, 1275000, 'GBP', owner_id),
  (r6,  ws_id, ev_riverside, 'Summer Music Festival',        'Festival',           'sent', (now() + interval '8 days')::date, now() + interval '8 days', 4500000, 12000000, 'GBP', owner_id),
  (r7,  ws_id, ev_theatre,   'West End Theatre Show',        'Theatre Show',       'under_review', (now() + interval '6 days')::date, now() + interval '6 days', 1800000, 3500000, 'GBP', owner_id),
  (r8,  ws_id, ev_mason40,   'Live Band Gig',                'Gig',                'draft', (now() + interval '2 days')::date, now() + interval '2 days', 200000, 480000, 'GBP', owner_id),
  (r9,  ws_id, ev_sandhu,    'Luxury Asian Wedding',         'Wedding',            'sent', (now() + interval '10 days')::date, now() + interval '10 days', 2200000, 4800000, 'GBP', owner_id),
  (r10, ws_id, ev_meridian,  'Leadership Offsite',           'Corporate Conference','responses_received', (now() + interval '7 days')::date, now() + interval '7 days', 1200000, 2850000, 'GBP', owner_id),
  (r11, ws_id, ev_hartley,   'Centenary Gala Production',    'Gala Dinner',        'awarded', (now() - interval '20 days')::date, now() - interval '20 days', 2800000, 5200000, 'GBP', owner_id),
  (r12, ws_id, ev_theatre,   'Corporate Gala Dinner AV',     'Corporate Conference','awarded', (now() - interval '35 days')::date, now() - interval '35 days', 900000, 1600000, 'GBP', owner_id),
  (r13, ws_id, ev_riverside, 'Food Festival Vendor Power',   'Festival',           'awarded', (now() - interval '12 days')::date, now() - interval '12 days', 400000, 900000, 'GBP', owner_id),
  (r14, ws_id, ev_afterdark, 'Nightclub Security Detail',    'Nightclub',          'closed', (now() - interval '48 days')::date, now() - interval '48 days', 300000, 600000, 'GBP', owner_id),
  (r15, ws_id, ev_sandhu,    'Sangeet Decor & Lighting',     'Wedding',            'closed', (now() - interval '60 days')::date, now() - interval '60 days', 1500000, 2900000, 'GBP', owner_id),
  (r16, ws_id, ev_mason40,   'Birthday Catering & Bar',      'Private Party',      'closed', (now() - interval '75 days')::date, now() - interval '75 days', 350000, 750000, 'GBP', owner_id)
ON CONFLICT (id) DO NOTHING;

-- Recipients: invite a realistic pool of active suppliers per RFQ, with mixed response states
INSERT INTO public.rfq_recipients (workspace_id, rfq_id, supplier_id, status, invited_at, responded_at, quote_amount_cents) VALUES
  (ws_id, r1, sup_atelier, 'accepted', now() - interval '9 days', now() - interval '6 days', 985000),
  (ws_id, r1, sup_saffron, 'responded', now() - interval '9 days', now() - interval '5 days', 1120000),
  (ws_id, r1, sup_wildflower, 'viewed', now() - interval '9 days', NULL, NULL),
  (ws_id, r1, sup_bassline, 'invited', now() - interval '9 days', NULL, NULL),

  (ws_id, r2, sup_saffron, 'responded', now() - interval '8 days', now() - interval '4 days', 445000),
  (ws_id, r2, sup_stagenation, 'responded', now() - interval '8 days', now() - interval '3 days', 512000),
  (ws_id, r2, sup_copper, 'declined', now() - interval '8 days', now() - interval '6 days', NULL),

  (ws_id, r3, sup_eventure, 'responded', now() - interval '15 days', now() - interval '9 days', 3980000),
  (ws_id, r3, sup_decibel, 'responded', now() - interval '15 days', now() - interval '8 days', 4250000),
  (ws_id, r3, sup_techsound, 'viewed', now() - interval '15 days', NULL, NULL),

  (ws_id, r4, sup_decibel, 'invited', now() - interval '3 days', NULL, NULL),
  (ws_id, r4, sup_techsound, 'viewed', now() - interval '3 days', NULL, NULL),

  (ws_id, r5, sup_sentinel, 'responded', now() - interval '4 days', now() - interval '2 days', 780000),
  (ws_id, r5, sup_premier, 'responded', now() - interval '4 days', now() - interval '1 days', 715000),
  (ws_id, r5, sup_maestro, 'declined', now() - interval '4 days', now() - interval '3 days', NULL),

  (ws_id, r6, sup_halo, 'invited', now() - interval '2 days', NULL, NULL),
  (ws_id, r6, sup_glow, 'viewed', now() - interval '2 days', NULL, NULL),
  (ws_id, r6, sup_sentinel, 'invited', now() - interval '2 days', NULL, NULL),

  (ws_id, r7, sup_reelatlas, 'responded', now() - interval '6 days', now() - interval '2 days', 2680000),
  (ws_id, r7, sup_northlt, 'responded', now() - interval '6 days', now() - interval '3 days', 2410000),

  (ws_id, r9, sup_wildflower, 'viewed', now() - interval '5 days', NULL, NULL),
  (ws_id, r9, sup_atelier, 'invited', now() - interval '5 days', NULL, NULL),
  (ws_id, r9, sup_bassline, 'invited', now() - interval '5 days', NULL, NULL),

  (ws_id, r10, sup_eventure, 'responded', now() - interval '4 days', now() - interval '1 days', 1980000),
  (ws_id, r10, sup_northstage, 'responded', now() - interval '4 days', now() - interval '2 days', 2150000),

  (ws_id, r11, sup_halo, 'accepted', now() - interval '30 days', now() - interval '24 days', 4850000),
  (ws_id, r11, sup_decibel, 'responded', now() - interval '30 days', now() - interval '25 days', 5100000),

  (ws_id, r12, sup_decibel, 'accepted', now() - interval '42 days', now() - interval '38 days', 1420000),
  (ws_id, r12, sup_techsound, 'responded', now() - interval '42 days', now() - interval '39 days', 1550000),

  (ws_id, r13, sup_silver, 'accepted', now() - interval '20 days', now() - interval '16 days', 720000),

  (ws_id, r14, sup_sentinel, 'accepted', now() - interval '55 days', now() - interval '52 days', 540000),
  (ws_id, r15, sup_atelier, 'accepted', now() - interval '68 days', now() - interval '64 days', 2650000),
  (ws_id, r16, sup_saffron, 'accepted', now() - interval '82 days', now() - interval '78 days', 610000)
ON CONFLICT DO NOTHING;

-- Formal responses + line items for the responded RFQs (representative subset)
INSERT INTO public.rfq_responses (workspace_id, rfq_id, supplier_id, status, total_amount_cents, currency, lead_time_days, valid_until, submitted_at) VALUES
  (ws_id, r1, sup_atelier, 'submitted', 985000, 'GBP', 14, (now() + interval '30 days')::date, now() - interval '6 days'),
  (ws_id, r1, sup_saffron, 'submitted', 1120000, 'GBP', 21, (now() + interval '30 days')::date, now() - interval '5 days'),
  (ws_id, r11, sup_halo, 'submitted', 4850000, 'GBP', 30, (now() + interval '10 days')::date, now() - interval '24 days'),
  (ws_id, r12, sup_decibel, 'submitted', 1420000, 'GBP', 10, (now() + interval '10 days')::date, now() - interval '38 days'),
  (ws_id, r13, sup_silver, 'submitted', 720000, 'GBP', 5, (now() + interval '10 days')::date, now() - interval '16 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.rfq_response_line_items (workspace_id, rfq_response_id, description, quantity, unit_price_cents, sort_order)
SELECT ws_id, rr.id, x.description, x.quantity, x.unit_price_cents, x.sort_order
FROM public.rfq_responses rr
JOIN (VALUES
  (r1, sup_atelier, 'Floral arch & aisle styling', 1, 450000, 1),
  (r1, sup_atelier, 'Table centrepieces (x18)', 18, 18000, 2),
  (r1, sup_atelier, 'Setup & breakdown crew', 1, 211000, 3),
  (r1, sup_saffron, 'Three-course plated dinner (x120)', 120, 8200, 1),
  (r1, sup_saffron, 'Canapé reception (x120)', 120, 1400, 2)
) AS x(rfq_id, supplier_id, description, quantity, unit_price_cents, sort_order)
  ON rr.rfq_id = x.rfq_id AND rr.supplier_id = x.supplier_id
ON CONFLICT DO NOTHING;

-- Awards for the three "awarded" RFQs (r11, r12, r13)
UPDATE public.rfqs SET awarded_supplier_id = sup_halo,     awarded_at = now() - interval '20 days' WHERE id = r11;
UPDATE public.rfqs SET awarded_supplier_id = sup_decibel,  awarded_at = now() - interval '35 days' WHERE id = r12;
UPDATE public.rfqs SET awarded_supplier_id = sup_silver,   awarded_at = now() - interval '12 days' WHERE id = r13;

INSERT INTO public.rfq_awards (workspace_id, rfq_id, rfq_response_id, supplier_id, awarded_by, awarded_at, award_reason, savings_cents)
SELECT ws_id, r11, rr.id, sup_halo, owner_id, now() - interval '20 days', 'Best technical proposal and proven track record at similar venues.', 150000
FROM public.rfq_responses rr WHERE rr.rfq_id = r11 AND rr.supplier_id = sup_halo
ON CONFLICT DO NOTHING;
INSERT INTO public.rfq_awards (workspace_id, rfq_id, rfq_response_id, supplier_id, awarded_by, awarded_at, award_reason, savings_cents)
SELECT ws_id, r12, rr.id, sup_decibel, owner_id, now() - interval '35 days', 'Lowest lead time and competitive pricing.', 130000
FROM public.rfq_responses rr WHERE rr.rfq_id = r12 AND rr.supplier_id = sup_decibel
ON CONFLICT DO NOTHING;
INSERT INTO public.rfq_awards (workspace_id, rfq_id, rfq_response_id, supplier_id, awarded_by, awarded_at, award_reason, savings_cents)
SELECT ws_id, r13, rr.id, sup_silver, owner_id, now() - interval '12 days', 'Only bidder able to meet the power-generation spec on time.', 80000
FROM public.rfq_responses rr WHERE rr.rfq_id = r13 AND rr.supplier_id = sup_silver
ON CONFLICT DO NOTHING;

END $$;
