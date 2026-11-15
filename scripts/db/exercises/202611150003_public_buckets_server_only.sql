-- Q04 exercise (rolled back): the client INSERT policies on the public buckets are gone, read/delete policies are unchanged, and a
-- signed-in workspace member can no longer write event-media directly (RLS refuses). Ends with EXERCISE_OK.
do $$
declare m record; n integer;
begin
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('event_media_insert', 'listing_media_insert', 'avatars_insert');
  if n <> 0 then raise exception 'public-bucket insert policies still present (%)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('event_media_delete', 'listing_media_delete', 'avatars_delete', 'event_media_select', 'listing_media_select', 'workspace_files_upload');
  if n <> 6 then raise exception 'read/delete/workspace-files policies changed (% of 6)', n; end if;

  select wm.user_id, wm.workspace_id into m from public.workspace_members wm where wm.status = 'active' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', m.user_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('event-media', m.workspace_id::text || '/q04-exercise.png', m.user_id);
    raise exception 'member wrote event-media directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', m.user_id::text || '/q04-exercise.png', m.user_id);
    raise exception 'user wrote avatars directly';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'EXERCISE_OK Q04 public buckets server-only';
end $$;
