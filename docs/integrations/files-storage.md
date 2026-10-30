# Files, storage & malware (Q04)

## Storage

- Supabase Storage buckets: public `event-media`, `listing-media`, `avatars` (PNG/JPEG/WebP only, 10/10/5 MB); private `workspace-files` (signed URLs only). Cloudflare R2 (`CLOUDFLARE_R2_S3_API`, `CLOUDFLARE_R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, optional `CLOUDFLARE_R2_JURISDICTION`) holds backups; `r2PresignedUrl()` / `presignR2()` sign one method on one tenant key (`t/<workspace|personal>/<owner>/<uuid>.<ext>`, `tenantKey()`) for at most 15 minutes, after the caller is authorised.
- Canonical metadata: `public.storage_attribution` (one row per object): workspace/user, file_class, sniffed_mime, declared_mime, sha256, size_bytes, display_name, scan_status, av_verdict, quarantine fields, retention_until, legal_hold, derivative lineage. Removed or blocked objects leave a `file_tombstones` row.

## Classes and the access rule (`file_access_decision`, mirrored by `accessDecision()` in `src/lib/files/policy.ts`)

| class | where | rule without a clean ClamAV verdict |
|---|---|---|
| public_media | public buckets | sanitised + magic-byte verified → usable (`not_scanned`) |
| private_image | workspace-files | same as public_media |
| private_document (PDF) | workspace-files | **quarantined** (fail closed) |
| sensitive (evidence, verification docs) | workspace-files | **quarantined** (fail closed) |
| derivative | public buckets | server re-encoded (sharp WebP), clean |
| legacy (pre-Q04) | any | PDFs fail closed; images/SVG elements/fonts use image rules |

Decision values: ok · pending · quarantined (HTTP 423) · infected / deleted (HTTP 410) · unknown (404).

## Upload pipeline (every server route)

size → magic bytes (declared type ignored, must agree) → class allow-list (no SVG in public buckets) → polyglot markers in binary images → sanitise (strip EXIF/GPS/XMP/IPTC; refuse active PDFs; refuse SVG with scripts/handlers/external refs/entities) → ClamAV (fail closed when misconfigured or unreachable) → store with a server-generated UUID key → `file_register` → jobs. Display names are sanitised (`safeFileName`); storage keys are never user-supplied.

Routes: `/api/uploads` (private), `/api/files/public-media` (event images), `/api/listing-media`, `/api/account/avatar`; downloads via `/api/files/signed` (own uploads) and the context routes (messages, requests, disputes, event files, media assets), all gated. Browsers never write public buckets in the Q04 code; after deploy apply `supabase/pending/q04_public_buckets_server_only.sql`.

## Background work (job_queue)

- `files.scan` (app): rescan one object; deferred when the gateway is not configured. Re-enqueue with `scripts/files/rescan-quarantined.mjs`.
- `/api/cron/scan-uploads` (pg_cron, 5 min): sweeps new objects; removes mismatched/polyglot/active/infected objects, audits `upload.blocked`, notifies the uploader.
- `files.derive` (app): 480 px WebP thumbnail for released public images.
- `files.retention_sweep` (db, 03:25 daily) → `files.delete_object` (app) per expired object; legal hold always wins.
- `files.meter_snapshot` (db, 00:35 daily) → `storage_usage_snapshots`. Quota enforcement unchanged (`trg_storage_quota`).

## ClamAV

Shared Blackwellen gateway (blackwellen-operations `services/av-scan-gateway`): `POST /scan` → `{clean, signature?}`. Gala Dock holds only `CLAMAV_SCAN_URL` + `CLAMAV_SCAN_TOKEN`. Not configured → BLOCKED_EXTERNAL; documents/sensitive files stay quarantined. **Effect after deploy:** the 10 stored request-attachment PDFs return 423 until scanned (`tests/release/pwa-completion-workflows.spec.ts:95` will fail until a clean verdict exists).
