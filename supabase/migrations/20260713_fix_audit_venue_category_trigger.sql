-- Fix: any INSERT/UPDATE/DELETE on public.venue_categories currently fails with
-- "relation admin_action_log does not exist" because audit_venue_category()
-- hard-fails on that insert. public.admin_action_log does not exist in this
-- database at all, and the one other trigger that also writes to it
-- (_venue_attachments_audit, on venue attachments) already defends against
-- exactly this with a BEGIN ... EXCEPTION WHEN OTHERS THEN NULL swallow — so
-- audit failures never block the actual mutation. audit_venue_category() was
-- missing that same guard. Apply the identical, already-proven pattern here
-- rather than inventing a new admin_action_log schema (the two triggers
-- disagree on column names — actor_id/entity/metadata vs
-- actor_user_id/entity_type/before/after — so a single table can't cleanly
-- satisfy both without also editing _venue_attachments_audit, which is out of
-- scope for this fix).

CREATE OR REPLACE FUNCTION public.audit_venue_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_workspace uuid;
  v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'venue_category.create';
    v_workspace := NEW.workspace_id;
    v_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'venue_category.update';
    v_workspace := NEW.workspace_id;
    v_id := NEW.id;
  ELSE
    v_action := 'venue_category.delete';
    v_workspace := OLD.workspace_id;
    v_id := OLD.id;
  END IF;

  BEGIN
    INSERT INTO public.admin_action_log (workspace_id, actor_id, action, entity, entity_id, metadata)
    VALUES (
      v_workspace,
      auth.uid(),
      v_action,
      'venue_category',
      v_id,
      jsonb_build_object('name', COALESCE(NEW.name, OLD.name))
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the venue_categories mutation on audit-log failure —
    -- matches the defensive pattern already used by _venue_attachments_audit().
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
