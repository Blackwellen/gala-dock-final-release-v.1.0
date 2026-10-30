-- Q45 performance sign-off (lane C, 2026-10-29). pg_stat_user_tables: tickets had 734 sequential scans reading 12.7 M rows and
-- check_ins 1,552 scans reading 12.5 M rows. EXPLAIN (ANALYZE, BUFFERS) on live data (17,798 tickets, 8,062 check-ins):
--   tickets where order_ref = …            Seq Scan, 17,794 rows removed, 478 buffers, 67 ms   (checkout issue / refund / webhook paths)
--   tickets where lower(attendee_email) = … Seq Scan, 478 buffers, 13 ms                      (DSAR export, guest linking)
--   check_ins where event_id = …            no event index (only partial client-scan / ticket indexes)  (scan dashboards, snapshots)
-- Additive indexes only. Both tables are small (< 20k rows), so a plain CREATE INDEX holds its SHARE lock for milliseconds
-- (measured in the dry run); CONCURRENTLY is reserved for large tables and cannot run inside the reviewed one-transaction apply.
-- Rollback: drop index if exists public.tickets_order_ref_idx, public.tickets_attendee_email_idx, public.check_ins_event_idx.

create index if not exists tickets_order_ref_idx on public.tickets (order_ref) where order_ref is not null;
create index if not exists tickets_attendee_email_idx on public.tickets (lower(attendee_email)) where attendee_email is not null;
create index if not exists check_ins_event_idx on public.check_ins (event_id, created_at desc);
