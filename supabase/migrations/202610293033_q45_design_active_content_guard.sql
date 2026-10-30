-- Q45 security sign-off (lane C, 2026-10-29) — finding Q45-S01 (P1, stored XSS).
-- Media Studio icon layers (designs / versions / templates / "my elements") and venue-plan glyphs (venue_maps.overlay,
-- venue_structures.elements) carry raw SVG markup that the editors inject with innerHTML (components/media/layer-view.tsx,
-- components/venue-plan/design-el-view.tsx); barcode colours are interpolated into SVG attributes (lib/tickets/code128.ts).
-- Those documents are written straight through REST by any workspace member, shared with collaborators, copied from the public
-- template gallery, and venue structures are pulled into organisers' event maps — i.e. markup crosses users and tenants.
-- The only screen was design_templates_scrub (public templates only), and it is bypassed by `<image/onerror=…>`, tab/newline
-- separated handlers and entity-encoded `javascript:` (verified in a rolled-back probe, 4 of 5 payloads accepted).
-- Additive fix: one immutable checker over every DECODED string in the document + a BEFORE INSERT/UPDATE guard on each column.
-- Existing data scanned before applying: 0 offending rows in all six tables (43 designs, 11 versions, 80 templates, 0 elements,
-- 32 venue maps, 10 venue structures). Applied by scripts/db/migrate.mjs in one transaction. Rollback: drop the six gd_q45_active_content triggers (functions are inert on their own).

-- Returns the first offending string (truncated) or null. Only strings that can break out of markup or an attribute (they contain
-- '<' or a quote) are judged, so ordinary text such as "Join online = free" is never refused.
create or replace function public.design_active_content(doc jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select min(left(s, 120)) from (
    select v #>> '{}' s from jsonb_path_query(coalesce(doc, 'null'::jsonb), 'strict $.**') v where jsonb_typeof(v) = 'string'
  ) x
  where s ~ '[<"'']' and (
       s ~* '\mon[a-z]+\s*='                                                   -- any event-handler attribute (after space, /, tab, quote…)
    or s ~* '<\s*/?\s*(script|iframe|frame|frameset|object|embed|applet|foreignobject|link|meta|base|form|input|button|textarea|select|option|isindex|animate|animatemotion|animatetransform|set|handler|listener|portal)\M'
    or s ~* '(java|vb|live)script\s*:'
    or s ~* 'data\s*:\s*text/html'
    or s ~* '&#|&(colon|tab|newline);')                                         -- entity-obfuscated schemes/handlers
$$;
revoke all on function public.design_active_content(jsonb) from public, anon;
grant execute on function public.design_active_content(jsonb) to authenticated, service_role;   -- called by the invoker trigger below on client writes

-- Generic guard: TG_ARGV[0] is the jsonb column to judge. Updates are judged only when that column changes, so unrelated edits
-- (status, title, publish) of any legacy row keep working.
create or replace function public.design_active_content_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare col text := tg_argv[0]; doc jsonb; bad text;
begin
  doc := to_jsonb(new) -> col;
  if tg_op = 'UPDATE' and doc is not distinct from (to_jsonb(old) -> col) then return new; end if;
  bad := public.design_active_content(doc);
  if bad is not null then
    raise exception 'design_active_content' using errcode = '22023',
      detail = format('%s.%s contains markup that can run script; remove event handlers, script/iframe/foreignObject elements and javascript: links.', tg_table_name, col);
  end if;
  return new;
end $$;
revoke all on function public.design_active_content_guard() from public, anon;
grant execute on function public.design_active_content_guard() to authenticated, service_role;

drop trigger if exists gd_q45_active_content on public.designs;
create trigger gd_q45_active_content before insert or update on public.designs for each row execute function public.design_active_content_guard('document');
drop trigger if exists gd_q45_active_content on public.design_versions;
create trigger gd_q45_active_content before insert or update on public.design_versions for each row execute function public.design_active_content_guard('document');
drop trigger if exists gd_q45_active_content on public.design_templates;
create trigger gd_q45_active_content before insert or update on public.design_templates for each row execute function public.design_active_content_guard('document');
drop trigger if exists gd_q45_active_content on public.design_elements;
create trigger gd_q45_active_content before insert or update on public.design_elements for each row execute function public.design_active_content_guard('data');
drop trigger if exists gd_q45_active_content on public.venue_maps;
create trigger gd_q45_active_content before insert or update on public.venue_maps for each row execute function public.design_active_content_guard('overlay');
drop trigger if exists gd_q45_active_content on public.venue_structures;
create trigger gd_q45_active_content before insert or update on public.venue_structures for each row execute function public.design_active_content_guard('elements');

