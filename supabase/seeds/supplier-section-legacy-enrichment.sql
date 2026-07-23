-- =============================================================================
-- Gala Dock — Supplier section legacy-row enrichment (follow-up to
-- supplier-section-demo-seed.sql). Idempotent: plain UPDATEs + ON CONFLICT
-- DO NOTHING inserts, safe to re-run.
--
-- Chrome MCP visual QA against the reference images surfaced 19 pre-existing
-- "Grannit Holdings" supplier rows (created by an earlier, unrelated seed
-- pass — two duplicate-name sets prefixed a001a001-.../b0000001-...) with no
-- category, no contact, no insurance date. They are real rows already
-- referenced elsewhere (event_suppliers etc. from demo-events-full-seed.sql),
-- so they are enriched in place here rather than deleted or hidden, to avoid
-- breaking any cross-section FK display.
-- =============================================================================

DO $$
DECLARE
  ws_id uuid := '045a53a6-d421-4836-bf9e-e7a5cf998834';
  owner_id uuid := '81b8cf5e-8f46-485a-b5b1-58f51d6109d7';

  cat_catering uuid := '704dee0e-60e4-493f-9fc4-47c313970b37';
  cat_photo    uuid := '6b61f413-c0fc-42f7-a692-4e808bf15159';
  cat_florist  uuid := '8bb4ef5b-bab8-46bf-ab58-a005eb32d410';
  cat_av       uuid := '90f089cd-45c3-46de-af8b-056e717cb71b';
  cat_music    uuid := '87da4541-bc31-41f6-a63a-9f37165ff7fe';
  cat_decor    uuid := '75bcf3ef-ee4c-4070-aab0-aeb2fa818110';
  cat_security uuid := '19b947d1-3d5f-4817-a327-fba8c55afc3c';
  cat_cleaning uuid;
BEGIN

  -- One new category for the sole row that doesn't fit any existing one.
  INSERT INTO public.supplier_categories (workspace_id, name, sort)
  VALUES (ws_id, 'Cleaning & Facilities', 13)
  ON CONFLICT DO NOTHING;
  SELECT id INTO cat_cleaning FROM public.supplier_categories
    WHERE workspace_id = ws_id AND name = 'Cleaning & Facilities';

  -- Category + tier + coverage + insurance for every uncategorised legacy row.
  UPDATE public.suppliers SET category_id = cat_av,       tier = 'preferred', coverage_regions = ARRAY['London','SE'],  insurance_expiry = '2026-09-11', primary_email = 'bookings@apexav.co.uk'       WHERE id IN ('a001a001-0000-0000-0000-000000000001','b0000001-0000-0000-0000-000000000001') AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_security, tier = 'verified',  coverage_regions = ARRAY['UK Wide'],       insurance_expiry = '2026-08-04', primary_email = 'ops@eventguardsecurity.co.uk' WHERE id IN ('a001a001-0000-0000-0000-000000000004','b0000001-0000-0000-0000-000000000004') AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_florist,  tier = 'preferred', coverage_regions = ARRAY['London','Home Counties'], insurance_expiry = '2026-07-29', primary_email = 'studio@floraleventdesign.co.uk' WHERE id IN ('a001a001-0000-0000-0000-000000000005','b0000001-0000-0000-0000-000000000005') AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_florist,  tier = NULL,        coverage_regions = ARRAY['London'],        insurance_expiry = '2026-10-02', primary_email = 'arabella@flowersbyarabella.com' WHERE id = '63c83870-d6dd-4260-801f-888404fb79a0' AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_catering, tier = 'verified',  coverage_regions = ARRAY['London','SE'],  insurance_expiry = '2026-08-21', primary_email = 'events@galacateringlondon.co.uk' WHERE id = 'a001a001-0000-0000-0000-000000000007' AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_catering, tier = 'preferred', coverage_regions = ARRAY['London','SE'],  insurance_expiry = '2026-09-05', primary_email = 'hello@greenleafcatering.co.uk' WHERE id IN ('a001a001-0000-0000-0000-000000000002','b0000001-0000-0000-0000-000000000002') AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_cleaning, tier = NULL,        coverage_regions = ARRAY['London'],        insurance_expiry = '2026-08-14', primary_email = 'ops@horizoncleaning.co.uk' WHERE id = 'b0000001-0000-0000-0000-000000000008' AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_photo,    tier = 'preferred', coverage_regions = ARRAY['Nationwide'],   insurance_expiry = '2026-09-28', primary_email = 'studio@lensworkphoto.co.uk'   WHERE id IN ('a001a001-0000-0000-0000-000000000003','b0000001-0000-0000-0000-000000000003') AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_decor,    tier = NULL,        coverage_regions = ARRAY['UK Wide'],       insurance_expiry = '2026-07-24', primary_email = 'orders@printcraftuk.co.uk'    WHERE id IN ('a001a001-0000-0000-0000-000000000008','b0000001-0000-0000-0000-000000000007') AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_av,       tier = NULL,        coverage_regions = ARRAY['London','SE'],  insurance_expiry = '2026-08-09', primary_email = 'hire@roomlinkav.co.uk'        WHERE id = 'b0000001-0000-0000-0000-000000000009' AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_music,    tier = 'verified',  coverage_regions = ARRAY['London','SE','M25'], insurance_expiry = '2026-09-16', primary_email = 'bookings@soundlabdj.co.uk' WHERE id = 'a001a001-0000-0000-0000-000000000009' AND category_id IS NULL;
  UPDATE public.suppliers SET category_id = cat_av,       tier = 'premium',   coverage_regions = ARRAY['Global'],        insurance_expiry = '2026-10-19', primary_email = 'live@streampulse.co.uk'       WHERE id IN ('a001a001-0000-0000-0000-000000000006','b0000001-0000-0000-0000-000000000006') AND category_id IS NULL;

  -- A named primary contact for each (name derived from the supplier name; email reuses the
  -- supplier's primary_email so the row is not "No contact on file").
  INSERT INTO public.supplier_contacts (workspace_id, supplier_id, name, email, phone, role, is_primary)
  SELECT ws_id, s.id, split_part(s.name, ' ', 1) || ' Team', s.primary_email, '+44 20 7946 ' || (1000 + (row_number() OVER ())::int), 'Account Manager', true
  FROM public.suppliers s
  WHERE s.workspace_id = ws_id
    AND s.id IN (
      'a001a001-0000-0000-0000-000000000001','b0000001-0000-0000-0000-000000000001',
      'a001a001-0000-0000-0000-000000000004','b0000001-0000-0000-0000-000000000004',
      'a001a001-0000-0000-0000-000000000005','b0000001-0000-0000-0000-000000000005',
      '63c83870-d6dd-4260-801f-888404fb79a0',
      'a001a001-0000-0000-0000-000000000007',
      'a001a001-0000-0000-0000-000000000002','b0000001-0000-0000-0000-000000000002',
      'b0000001-0000-0000-0000-000000000008',
      'a001a001-0000-0000-0000-000000000003','b0000001-0000-0000-0000-000000000003',
      'a001a001-0000-0000-0000-000000000008','b0000001-0000-0000-0000-000000000007',
      'b0000001-0000-0000-0000-000000000009',
      'a001a001-0000-0000-0000-000000000009',
      'a001a001-0000-0000-0000-000000000006','b0000001-0000-0000-0000-000000000006'
    )
    AND NOT EXISTS (SELECT 1 FROM public.supplier_contacts c WHERE c.supplier_id = s.id);

  -- Approved documents for every requirement of their new category (mirrors the main seed's
  -- "clean supplier" pattern), and set onboarding-relevant last_used_at.
  INSERT INTO public.supplier_files (workspace_id, supplier_id, kind, document_type, filename, storage_path, review_status, risk_level, issue_date, due_date, uploaded_by)
  SELECT ws_id, s.id, 'cert', r.document_type,
    r.document_type || '.pdf',
    'workspaces/' || ws_id || '/suppliers/' || s.id || '/documents/' || replace(lower(r.document_type), ' ', '-') || '.pdf',
    'approved', 'compliant', now() - interval '150 days', now() + interval '120 days', owner_id
  FROM public.suppliers s
  JOIN public.supplier_document_requirements r ON r.category_id = s.category_id AND r.workspace_id = ws_id
  WHERE s.workspace_id = ws_id
    AND s.category_id IN (cat_av, cat_security, cat_florist, cat_catering, cat_cleaning, cat_photo, cat_decor, cat_music)
    AND s.id IN (
      'a001a001-0000-0000-0000-000000000001','b0000001-0000-0000-0000-000000000001',
      'a001a001-0000-0000-0000-000000000004','b0000001-0000-0000-0000-000000000004',
      'a001a001-0000-0000-0000-000000000005','b0000001-0000-0000-0000-000000000005',
      '63c83870-d6dd-4260-801f-888404fb79a0',
      'a001a001-0000-0000-0000-000000000007',
      'a001a001-0000-0000-0000-000000000002','b0000001-0000-0000-0000-000000000002',
      'b0000001-0000-0000-0000-000000000008',
      'a001a001-0000-0000-0000-000000000003','b0000001-0000-0000-0000-000000000003',
      'a001a001-0000-0000-0000-000000000008','b0000001-0000-0000-0000-000000000007',
      'b0000001-0000-0000-0000-000000000009',
      'a001a001-0000-0000-0000-000000000009',
      'a001a001-0000-0000-0000-000000000006','b0000001-0000-0000-0000-000000000006'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.supplier_files f
      WHERE f.supplier_id = s.id AND f.document_type = r.document_type AND f.archived_at IS NULL
    );

  UPDATE public.suppliers SET last_used_at = now() - interval '40 days'
  WHERE workspace_id = ws_id AND last_used_at IS NULL AND id IN (
    'a001a001-0000-0000-0000-000000000001','b0000001-0000-0000-0000-000000000001',
    'a001a001-0000-0000-0000-000000000004','b0000001-0000-0000-0000-000000000004',
    'a001a001-0000-0000-0000-000000000005','b0000001-0000-0000-0000-000000000005',
    '63c83870-d6dd-4260-801f-888404fb79a0',
    'a001a001-0000-0000-0000-000000000007',
    'a001a001-0000-0000-0000-000000000002','b0000001-0000-0000-0000-000000000002',
    'b0000001-0000-0000-0000-000000000008',
    'a001a001-0000-0000-0000-000000000003','b0000001-0000-0000-0000-000000000003',
    'a001a001-0000-0000-0000-000000000008','b0000001-0000-0000-0000-000000000007',
    'b0000001-0000-0000-0000-000000000009',
    'a001a001-0000-0000-0000-000000000009',
    'a001a001-0000-0000-0000-000000000006','b0000001-0000-0000-0000-000000000006'
  );

END $$;
