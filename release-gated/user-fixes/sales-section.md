# Sales Section — Manual / Follow-Up Actions Required

Items Claude Code could not complete autonomously in this pass, with exact steps.

## 1. Chrome MCP visual QA is blocked — restart the automation Chrome profile

**Symptom:** every `chrome-devtools-mcp` tool call fails with:
> The browser is already running for `C:\Users\PC\.cache\chrome-devtools-mcp\chrome-profile`. Use `--isolated` to run multiple browser instances.

**Cause:** a Chrome process from an earlier session is still holding that automation profile directory. This is a *different* Chrome profile/process from your normal browser window — it's launched with `--remote-debugging-pipe` and `--user-data-dir=...\chrome-devtools-mcp\chrome-profile`, which only the devtools-mcp tooling uses.

**Fix (pick one):**
1. Open Task Manager, find the Chrome process(es) whose command line includes `chrome-devtools-mcp\chrome-profile` (there will be one main process plus a few `--type=` helper processes with the same `--user-data-dir`), and end that process tree. Your regular Chrome window (any other Chrome process) is unaffected.
2. Or in a terminal: `tasklist /V | findstr chrome.exe` to find the PID, confirm its command line with `wmic process where "ProcessId=<PID>" get CommandLine`, and if it references `chrome-devtools-mcp`, run `taskkill /PID <PID> /T /F`.

Once that's closed, re-run the visual QA pass: open each of the 8 routes below at 1440×900 (then repeat at 1280, 1024, tablet ~834×1194, mobile ~390×844), compare against the corresponding file in `working_imagesS_sales/`, and note any spacing/sizing corrections in `docs/qa/sales-section-visual-qa.md` (not yet created — create it as part of this follow-up).

| Reference image | Route |
|---|---|
| `...(2).png` | `/event-manager/leads/new?step=contact` |
| `...(1).png` | `/event-manager/leads/new?step=event-details` |
| `...(3).png` | `/event-manager/leads/new?step=qualification` |
| `...(4).png` | `/event-manager/leads?view=list` |
| `...(5).png` | `/event-manager/leads?view=kanban` |
| `...(6).png` | `/event-manager/leads?view=cards` |
| `...(8).png` | `/event-manager/proposals?view=list` |
| `...(7).png` | `/event-manager/proposals?view=cards` |

## 2. Cloudflare R2 upload wiring for lead/proposal attachments

The wizard's "Inspiration & References" drop-zone and "Browse Files" button are visually present but intentionally non-functional (they show a "being finalised" notice rather than faking a successful upload). To wire this up:
- Reuse `src/lib/storage/r2.ts` (`r2Config()`, `r2Key()`) and the existing presign endpoint at `src/app/api/r2/presign/route.ts` — the same pattern already used by `DocumentUploadClient.tsx` in the events module.
- Add a `lead_attachments` (or similar) table with `workspace_id`, `lead_id`, `r2_key`, `original_file_name`, `mime_type`, `size_bytes`, `uploaded_by`, `created_at` — none exists yet.
- Key structure suggestion: `workspaces/{workspace_id}/sales/leads/{lead_id}/inspiration/{uuid}-{safe_filename}`.

## 3. PDF generation, email delivery, e-signature provider

None of these are wired up (this was true before this pass and remains true after it — explicitly out of scope). To implement:
- Pick a PDF renderer (e.g. `@react-pdf/renderer` or a headless-Chrome print-to-PDF route) and generate from the existing `ProposalDocument.tsx` render tree.
- Pick an email provider — a Resend MCP connector is available in this environment but requires you to authorize it first (`claude mcp` / `/mcp` in an interactive session); it cannot be authorized from here.
- E-signature: the current `/p/[proposalToken]` flow only captures a typed name + consent checkbox into the `proposals` table (`signed_by_name`, `signed_by_email`, `signed_at`, `signed_ip`). If you need a legally-robust e-signature (audit trail, certificate, tamper-evidence), integrate a real provider (DocuSign, Dropbox Sign, etc.) rather than relying on this captured-name approach for anything beyond an internal MVP.

## 4. Supabase CLI migration-history drift

`supabase db push` currently fails with "Remote migration versions not found in local migrations directory" listing ~150 historical migration versions. This is pre-existing and unrelated to this pass — migrations were instead applied directly via `supabase db query --linked -f <file>`, which works but bypasses the CLI's own migration-tracking table. Recommended follow-up: run `supabase db pull` in a safe moment to reconcile the local migrations directory with the remote history, or `supabase migration repair --status reverted <versions...>` (metadata-only, does not touch actual table data) — do this deliberately, not as a side effect of an unrelated feature push.

## 5. Fake/placeholder owner avatars in seed data

All demo leads/proposals are assigned to the one real workspace member rather than the varied named cast shown in the reference images (contact names like "James Clarke", "Sarah Carter" etc. ARE real/correct — only the internal *owner* avatar is uniform). To get varied owner avatars, invite additional real team members to the Grannit Holdings workspace (Settings → Team) — do not fabricate `auth.users` rows directly in SQL.

## 6. Bulk actions, saved views, import/export

Row checkboxes and "Saved Views" dropdowns are functional client-side (real multi-select state, real filter-preset application) but nothing persists server-side and no bulk-action toolbar is wired (no bulk assign/archive/export). Building this needs: a `sales_saved_views` table (workspace + user scoped) and bulk server actions with the same permission checks as the existing single-record actions in `leads/actions.ts`.
