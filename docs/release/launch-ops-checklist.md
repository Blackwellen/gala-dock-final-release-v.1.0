# Gala Dock launch ops checklist (playbook §8, 2026-11-11)

The ops lane owns Watchtower (incl. `/api/health/ready`), Hermes, the AV gateway (main + standby, fail-closed) and Uptime Kuma, and reports them itself. This page covers the remaining §8 items.

## 1. Retention decision (UK GDPR) and the privacy notice
The shared Blackwellen retention decision (cross-brand notes §5):
- Supabase daily backups are kept 7 days.
- Our encrypted R2 copies are kept 15 minutes, then daily for 8 days, weekly for 29 days and monthly for 63 days.
- **Deleted data leaves every backup within 65 days.**
- Erasures are re-applied after any restore.

**Status:** neither the privacy notice nor `/data-retention` states this yet. The text is in `docs/legal/v2-signoff-checklist.md` B5 and needs owner publication.

## 2. Demo data
**Today:** every public event (10 of 10 in `events_public`) belongs to a demo workspace, and demo listings are visible in the marketplace. Analytics already exclude demo workspaces (`is_demo_workspace`).

**Switch BUILT 2026-11-11** (migration 202611116009, `launch_settings.demo_public_visible`, default visible). Turning it off hides demo workspaces' public events (`events_public`) and listings (listings RLS) from anonymous visitors and real users. Demo users, members and admins still see them. Staff toggle: `adm_set_demo_public_visible(false, 'launch')` (settings permission + second factor, audited). Earlier options for reference:
- (a) Keep the demo content as labelled examples. The public lane would mark it as "Example".
- (b) Add a `demo_public_visible` platform setting that `events_public` and the listing search check. Default on until launch, then off.
- (c) Delete it with a backup first. This breaks the QA suites that run on the same database, so it is not recommended while the DB is shared.

Recommended: (b), switched off at go-live. Ask for it if wanted; it touches the public read projections, which belong to the public-pages lane.

## 3. Credential rotation list
Rotate every credential below that has appeared in chat, terminal transcripts or screenshots. Values were never printed by this lane; names only.

| Credential | Where | Note |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PAT_KEY` | Supabase | PAT used by agents for migrations; rotate after the release push |
| `STRIPE_SECRET_KEY` (live), `STRIPE_SECRET_KEY_SANDBOX`, webhook secrets ×4 | Stripe | live key was briefly the production Connect key on 2026-10-30 |
| `AZURE_OPENAI_API_KEY` | Azure | |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_API_TOKEN` | Cloudflare | |
| `CLAMAV_SCAN_TOKEN` | ops AV gateway | coordinate with the ops lane |
| `RESEND_API`, `SMTP_PASSWORD` | email | |
| `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `MAP_TILER_API_KEY` | OAuth, captcha, maps | |
| `CRON_SECRET`, `TICKET_QR_SECRET`, `BLACKWELLEN_EVENTS_SECRET_HEX`, `WATCHTOWER_PROBE_SECRET_HEX` | app | rotating `TICKET_QR_SECRET` invalidates issued QR codes; plan a dual-key window |
| `DEMO_*_PASSWORD`, `DEMO_*_TOTP_SECRET` | demo personas | rotate, or disable the demo admin personas at launch |

## 4. Hosting regions and DPAs

| Processor | Region | DPA |
|---|---|---|
| Supabase (DB, auth, storage) | **eu-west-2 (London)**, verified via the management API | Supabase DPA: record the signed copy |
| Vercel (app) | **not pinned**: no `vercel.json`, so functions run in the default region (US East). **Recommend `lhr1` (London)** to sit next to Supabase eu-west-2 (London): lower DB latency and UK data residency. Set in Vercel → Settings → Functions → Region, or `vercel.json` `{"regions":["lhr1"]}` (owner) | Vercel DPA |
| Stripe Payments UK | UK/EU | Stripe Services Agreement + DPA |
| Azure OpenAI | resource `blackwellen1996-1143-resource`: **confirm the region (UK South / EU) in the portal** | Microsoft Products and Services DPA |
| Cloudflare R2 (backups, files) | location hint to confirm (EU) | Cloudflare DPA |
| Resend (email) | confirm the EU region | Resend DPA |

## 5. Go-live checklist (in order)
1. Owner decisions: DEC-107 §8; legal sign-off F1–F6; demo data (2); Vercel region (4).
2. Deploy the code that matches the live DB (DEC-107 migrations 202611116001–6006 are already applied). Before any real seller is invited, deploy (`docs/backend/payments/dec107-gala-dock.md` §5).
3. Smoke: `/api/health/ready`, sign-in, ticket checkout and booking payment in **sandbox**, `dec107_invariants()` = [].
4. Publish the legal texts (with 15 days' P2B notice to business users).
5. Re-enable Supabase captcha (T1/T2 in the queue).
6. Rotate credentials (3).
7. Take Gala Dock off Watchtower's not-live list (ops lane) so alerts reach the director.
8. Only on the owner's explicit word: switch `STRIPE_CONNECT_SECRET_KEY` to live, then run the live preflight. Real sellers onboard fresh DEC-107 accounts.

## 6. Yearly refresh: UK bank holidays
Ticket releases are event end + 5 UK business days, with bank holidays excluded (`uk_bank_holidays`, migration 202611116150). The table is seeded from https://www.gov.uk/bank-holidays.json for 2026–2028 (England and Wales, Scotland, Northern Ireland).
- **Every January**, add the newly published year with an additive migration: same insert, `on conflict do update`.
- **Before 2029 at the latest.** After the last seeded date, only weekends are skipped, so a release could come a day early.
