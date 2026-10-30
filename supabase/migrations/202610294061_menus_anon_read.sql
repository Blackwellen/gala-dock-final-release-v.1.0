-- Public venue / service pages (lane C, W01 Part 2, 2026-10-29): published menus were meant to be public (menus_read,
-- menu_sections_read, menu_items_read allow status = 'published'), but every anon read failed with
-- "permission denied for function has_workspace_role": the FOR ALL write policies were created TO public, so Postgres also
-- evaluates them for anon SELECTs, and anon has no EXECUTE on has_workspace_role (revoked in 202610120003).
-- Fix: scope the three write policies to authenticated (the only role that can ever satisfy has_workspace_role).
-- No change for signed-in users; anon gains exactly what the read policies already describe (published menus only).
begin;
alter policy menus_write on public.menus to authenticated;
alter policy menu_sections_write on public.menu_sections to authenticated;
alter policy menu_items_write on public.menu_items to authenticated;
commit;
