-- Q04 (PENDING — apply only AFTER the Q04 code is deployed; it is not in supabase/migrations so nothing applies it early).
-- Closes the last path by which a client could write a public bucket directly (the deployed poster builder / ticket map / avatar /
-- listing routes used the browser or user-scoped clients; the Q04 code uploads through the server with the service role after
-- magic-byte, MIME, polyglot, metadata and malware checks). Read/delete policies are unchanged.
-- Apply: copy to supabase/migrations/2026102910NN_public_buckets_server_only.sql, add it to scripts/testing/apply-q04q06-migration.mjs, dry-run, apply.
drop policy if exists event_media_insert on storage.objects;
drop policy if exists listing_media_insert on storage.objects;
drop policy if exists avatars_insert on storage.objects;
