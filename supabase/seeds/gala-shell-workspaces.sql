-- Gala Dock development shell workspaces for jamahlthomas1996@gmail.com.
-- Safe to re-run: this seed updates only the seven IDs below, restores the
-- user's owner memberships, and makes the first organizer workspace active.
-- It deliberately fails if the intended Auth user is absent.

DO $$
DECLARE
  target_user_id uuid;
  v_active_workspace_id uuid := '36549daf-eb91-4fb0-9d24-29a407e8d8ee';
  workspace_record record;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = 'jamahlthomas1996@gmail.com'
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed Gala Dock shell workspaces: Auth user jamahlthomas1996@gmail.com was not found.';
  END IF;

  FOR workspace_record IN
    SELECT * FROM (VALUES
      ('36549daf-eb91-4fb0-9d24-29a407e8d8ee'::uuid, 'Jamahl Event Management', 'jamahl-event-management', 'organizer', 'growth'),
      ('fe33c7f5-27ee-427e-a73a-804568f17e0f'::uuid, 'Jamahl Event Agency', 'jamahl-event-agency', 'organizer', 'scale'),
      ('6622637b-d3b8-4297-afe4-0dd5ffaf98eb'::uuid, 'Jamahl Corporate Events', 'jamahl-corporate-events', 'organizer', 'enterprise'),
      ('8c4da205-55c3-4357-a0bc-bd74d8f70f60'::uuid, 'Jamahl Venue Group', 'jamahl-venue-group', 'venue', 'scale'),
      ('d991eabb-70d5-4fdc-af6d-325125b1d04e'::uuid, 'Jamahl Supplier Studio', 'jamahl-supplier-studio', 'supplier', 'growth'),
      ('746693f2-c70a-4e64-bc0d-316b0a218d69'::uuid, 'Jamahl Supplier Collective', 'jamahl-supplier-collective', 'supplier', 'scale'),
      ('46dafc4e-e05c-41c9-80e8-78d3ae94f9e5'::uuid, 'Jamahl Live Entertainment', 'jamahl-live-entertainment', 'supplier', 'scale')
    ) AS source(id, name, slug, workspace_type, plan)
  LOOP
    UPDATE public.workspaces
    SET name = workspace_record.name,
        slug = workspace_record.slug,
        owner_user_id = target_user_id,
        workspace_type = workspace_record.workspace_type,
        plan = workspace_record.plan,
        release_stage = 'v1',
        timezone = 'Europe/London',
        locale = 'en-GB',
        country = 'GB',
        currency = 'GBP',
        updated_at = now()
    WHERE id = workspace_record.id;

    IF NOT FOUND THEN
      INSERT INTO public.workspaces (
        id, name, slug, owner_user_id, workspace_type, plan, release_stage,
        timezone, locale, country, currency
      ) VALUES (
        workspace_record.id, workspace_record.name, workspace_record.slug,
        target_user_id, workspace_record.workspace_type, workspace_record.plan,
        'v1', 'Europe/London', 'en-GB', 'GB', 'GBP'
      );
    END IF;

    UPDATE public.workspace_members
    SET role = 'owner', deleted_at = NULL, updated_at = now()
    WHERE workspace_id = workspace_record.id AND user_id = target_user_id;

    IF NOT FOUND THEN
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (workspace_record.id, target_user_id, 'owner');
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET active_workspace_id = v_active_workspace_id, updated_at = now()
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, display_name, active_workspace_id, timezone, locale)
    VALUES (target_user_id, 'Jamahl Thomas', v_active_workspace_id, 'Europe/London', 'en-GB');
  END IF;
END $$;

-- Verification query (run after the seed):
-- SELECT w.name, w.workspace_type, w.plan, wm.role
-- FROM public.workspace_members wm
-- JOIN public.workspaces w ON w.id = wm.workspace_id
-- JOIN auth.users u ON u.id = wm.user_id
-- WHERE lower(u.email) = 'jamahlthomas1996@gmail.com' AND wm.deleted_at IS NULL
-- ORDER BY w.name;
