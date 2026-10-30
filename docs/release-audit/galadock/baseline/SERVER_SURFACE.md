# Server surface baseline (Q00)

Generated 2026-10-28 from the working tree (uncommitted work included) and a read-only look at the live project (pg_cron, storage). Env vars are listed by **name only**.

## Summary

| Surface | Count | Notes |
|---|---|---|
| Server-action modules (`"use server"` files) | 84 | 36 under `src/lib/actions/`, 15 more under `src/lib/**`, 33 colocated in `src/app/**/actions.ts` |
| Exported server actions | 351 | plus 2 inline actions (`src/app/pay/[token]/page.tsx:18`, `src/app/r/[code]/consent/page.tsx:15`) |
| Route handlers (`route.ts`) | 78 | 54 under `/api`, 12 admin CSV exports, 2 provider exports, 2 partner files, 4 `/auth/*`, `/continue`, `/r/[code]`, `/portal/[token]/documents/[id]`, `/tickets/[id]/join` |
| Cron-invoked HTTP workers | 8 | `/api/cron/{payments,email,privacy,webhooks,storage-backup,scan-uploads,calendar-sync}` + `/api/agent/worker`, all `CRON_SECRET` bearer |
| pg_cron jobs (live) | 16 | 8 call the HTTP workers via `public.dispatch_worker()` (pg_net), 7 run SQL directly, 1 (`db-backup`) calls the Edge Function |
| Supabase Edge Functions | 1 | `supabase/functions/db-backup` (Deno; nightly logical backup to R2) |
| Inbound webhooks | 1 endpoint | `/api/stripe/webhook`: one URL, 4 signing secrets (live/sandbox × platform/Connect) |
| Outbound webhooks | 1 system | developer `webhook_endpoints` → `webhook_deliveries`, sent by `/api/cron/webhooks` (SSRF guard `src/lib/developer/ssrf.ts`), 25 event types |
| OAuth callbacks | 3 | Google sign-in (`/api/auth/google/*`), calendar Google/Microsoft (`/api/calendar/oauth/[provider]/*`), Supabase auth (`/auth/callback`, `/auth/confirm`) |
| Public developer API | 3 routes | `/api/v1/openapi.json`, `/api/v1/tools`, `/api/v1/tools/[tool]` + MCP `/api/mcp` (API-key bearer, same tool registry as the Agent) |
| Gala Agent tools | 30 | `src/lib/agent/registry.ts` = seed `209912310002` = live `agent_tools` (30 rows, ids identical) |
| Storage buckets | 4 Supabase + R2 | see below |
| Feature flags | no flag table | see below |
| External integrations | 14 | see below |

## Server actions

All 84 modules with their exported actions (names from `export async function` / `export const … = async`). Every module starts with `"use server"`. Auth is established inside each action (`getCustomer`/`getOrganizer`/`getProvider`/`getAdmin`/`requireUser`/`requireAdminPermission`) and RLS applies to the user client; a per-action authz audit is Q01.

| Module | # | Actions |
|---|---|---|
| `src/app/admin/(console)/_a/actions.ts` | 11 | setUserStatus, revokeSessions, addRecordNote, setWorkspaceStatus, setWorkspacePlan, setWorkspaceCommission, reviewListing, setEventRestriction, setEventFeatured, setTicketSales, reviewForceMajeure |
| `src/app/admin/(console)/_b/actions.ts` | 24 | requestRefund, retryPayout, cancelMoneyRequest, addNote, createSupportCase, replyCase, assignCase, setCaseStatus, resolveCase, decideTrust, assignTrust, requestEvidence, createTrustCase, setPartnerStatus, setPartnerTerms, requestPartnerPayout, decideAgentApproval, controlRun, startAdminRun, setIntegration, saveSettingsDraft, publishSettingsDraft, discardSettingsDraft, rollbackSetting |
| `src/app/admin/(console)/agent-integrations/credits/actions.ts` | 1 | grantCredits |
| `src/app/admin/(console)/conversations/actions.ts` | 5 | requestAccess, decideAccess, openConversation, touchConversation, closeAccess |
| `src/app/admin/(console)/disputes/actions.ts` | 2 | adminUpdateDispute, adminDecideCancellation |
| `src/app/admin/(console)/maintenance/actions.ts` | 2 | startMaintenance, endMaintenance |
| `src/app/admin/(console)/support/privacy/actions.ts` | 1 | updatePrivacyRequest |
| `src/app/checkout/[event]/actions.ts` | 4 | reserve, releaseHold, reserveResale, claimOffer |
| `src/app/organizer/events/[id]/map/actions.ts` | 1 | saveEventPlan |
| `src/app/partner/actions.ts` | 1 | contactSupport |
| `src/app/portal/[token]/actions.ts` | 2 | decideApproval, postComment |
| `src/app/promoter/actions.ts` | 1 | setPayoutMethod |
| `src/app/proposal/[token]/actions.ts` | 1 | acceptProposal |
| `src/app/provider/actions.ts` | 1 | switchProviderWorkspace |
| `src/app/provider/agent/actions.ts` | 4 | decideApproval, toggleRoutine, controlRun, startRun |
| `src/app/provider/bookings/[id]/actions.ts` | 1 | recordBookingFile |
| `src/app/provider/bookings/actions.ts` | 4 | transitionBooking, assignCrew, raiseIssue, requestChange |
| `src/app/provider/bookings/new/actions.ts` | 3 | saveBookingStep, discardBookingDraft, confirmBooking |
| `src/app/provider/calendar/actions.ts` | 1 | setAvailability |
| `src/app/provider/listings/actions.ts` | 5 | publishListing, pauseListing, duplicateListing, setSpaceStatus, setPackageStatus |
| `src/app/provider/messages/actions.ts` | 1 | sendThreadMessage |
| `src/app/provider/opportunities/[id]/actions.ts` | 4 | offerOption, askClarification, addInternalNote, toggleSaved |
| `src/app/provider/opportunities/[id]/quote/actions.ts` | 2 | saveQuoteDraft, sendQuote |
| `src/app/provider/opportunities/actions.ts` | 2 | respondToRequest, releaseHold |
| `src/app/provider/packages/actions.ts` | 6 | savePackageOffer, savePackagePricing, savePackageAvailability, savePackagePhotos, setPackageLive, duplicatePackage |
| `src/app/provider/quotes/actions.ts` | 2 | sendDraftQuote, withdrawQuote |
| `src/app/provider/services/actions.ts` | 5 | saveServiceBasics, saveServicePricing, saveServiceAvailability, saveServicePackage, saveServiceInfo |
| `src/app/provider/settings/_components/credentials-actions.ts` | 1 | submitCredential |
| `src/app/provider/settings/actions.ts` | 9 | saveProfile, setCapability, saveBooking, saveComms, saveNotifications, saveAgent, saveTax, inviteMember, revokeInvite |
| `src/app/provider/team/actions.ts` | 4 | saveCrew, setCrewStatus, addCrewUnavailability, requestAvailability |
| `src/app/provider/venues/[id]/actions.ts` | 4 | saveVenueInfo, saveCommercial, saveSpace, saveStructure |
| `src/app/provider/venues/[id]/spaces/actions.ts` | 4 | saveSpaceFields, setSpaceLinks, duplicateSpace, saveSpaceSection |
| `src/app/provider/venues/new/actions.ts` | 4 | saveIdentity, saveCommercialStep, saveOperations, savePhotos |
| `src/lib/actions/account.ts` | 9 | saveProfile, saveEventPreferences, saveNotifications, changePassword, accountDeletion, calendarFeed, startAddCard, setDefaultCard, removeCard |
| `src/lib/actions/agent.ts` | 4 | startRun, decideApproval, toggleRoutine, createRoutine |
| `src/lib/actions/booking.ts` | 4 | saveBookingDraft, submitBooking, acceptQuote, checkAvailability |
| `src/lib/actions/boosts.ts` | 1 | buyBoost |
| `src/lib/actions/build-extra.ts` | 3 | reorderBuild, replaceWith, addAndRequest |
| `src/lib/actions/build.ts` | 7 | addToBuild, removeFromBuild, requestQuote, holdItem, setItemRole, dateChangeImpact, changeEventDate |
| `src/lib/actions/builders.ts` | 2 | savePage, saveMediaAsset |
| `src/lib/actions/calendar.ts` | 2 | createCalendarEntry, rescheduleEntry |
| `src/lib/actions/checkin.ts` | 1 | scanTicket |
| `src/lib/actions/create-event.ts` | 2 | saveCreateStep, finishCreate |
| `src/lib/actions/event-profile.ts` | 12 | setEventStatus, updateEventBasics, confirmVenueOffPlatform, savePublicPageSettings, addProgrammeItem, deleteProgrammeItem, setRunSheetStatus, addTask, toggleTask, reportIncident, resolveIncident, transitionItem |
| `src/lib/actions/events.ts` | 5 | duplicateEvent, archiveEvent, cancelEvent, duplicateMyEvent, importEvents |
| `src/lib/actions/files.ts` | 1 | registerEventFile |
| `src/lib/actions/guests.ts` | 6 | addGuest, importGuests, sendInvites, setGuestStatus, removeGuest, createTier |
| `src/lib/actions/invoice-wizard.ts` | 2 | saveInvoiceDraft, scheduleInvoice |
| `src/lib/actions/marketplace.ts` | 3 | sendRequest, selectQuote, messageAllProviders |
| `src/lib/actions/messages.ts` | 2 | sendMessage, markThreadRead |
| `src/lib/actions/money.ts` | 6 | issueInvoice, remindInvoice, creditInvoice, recordPayment, paymentLink, saveInvoiceNotes |
| `src/lib/actions/my-events.ts` | 5 | cancellationImpact, cancelMyEvent, archiveMyEvent, upgradeToOrganizer, toggleMyTask |
| `src/lib/actions/plan-wizard.ts` | 3 | savePlanStep, createFromPlan, discardPlan |
| `src/lib/actions/plan.ts` | 2 | addCustomerTask, addDayPlanItem |
| `src/lib/actions/poster-copy.ts` | 1 | suggestPosterCopy |
| `src/lib/actions/promotion.ts` | 4 | savePromotionPlan, setPromotionStatus, createPromoter, setDistribution |
| `src/lib/actions/proposals.ts` | 9 | proposalTotals, saveProposalClient, saveProposalPricing, sendProposal, reviseProposal, withdrawProposal, duplicateProposal, convertProposal, toggleProposalOption |
| `src/lib/actions/provider-search.ts` | 2 | searchProviders, listingAvailabilityFor |
| `src/lib/actions/request-status.ts` | 1 | setRequestStatus |
| `src/lib/actions/reviews.ts` | 2 | submitReview, deleteReview |
| `src/lib/actions/sales.ts` | 7 | createLead, moveLead, loseLead, scheduleFollowUp, assignLead, addLeadNote, convertLead |
| `src/lib/actions/shell.ts` | 2 | switchWorkspace, markNotificationsRead |
| `src/lib/actions/support.ts` | 1 | contactSupport |
| `src/lib/actions/team.ts` | 6 | savePerson, setPersonStatus, assignShift, setShiftStatus, requestAvailability, addNote |
| `src/lib/actions/templates.ts` | 1 | saveTemplate |
| `src/lib/actions/ticket-pro.ts` | 5 | saveProModel, saveProTiers, saveAllocation, saveAccess, activateTickets |
| `src/lib/actions/ticket-setup.ts` | 3 | saveTicketModel, saveSalesRules, publishTickets |
| `src/lib/actions/tickets.ts` | 3 | transferTicket, resaleTicket, updateAttendee |
| `src/lib/actions/workspace-settings.ts` | 2 | saveWorkspaceSettings, changeMemberRole |
| `src/lib/agent/actions.ts` | 11 | startRun, confirmPlan, controlRun, decideApproval, approveBatch, askAgent, saveRoutine, toggleRoutine, savePolicy, createWatch, startBatch |
| `src/lib/agent/credits.ts` | 1 | saveAiBudget |
| `src/lib/developer/actions.ts` | 7 | webhookEvents, createApiKey, revokeApiKey, createWebhook, setWebhookStatus, testWebhook, replayDelivery |
| `src/lib/live/actions.ts` | 4 | setProviderCheckin, setProgrammeStatus, reportIncident, resolveIncident |
| `src/lib/marketplace/actions.ts` | 21 | requestHold, respondHold, releaseHold, requestStandby, offerStandby, declineStandby, acceptStandby, activateStandby, releaseStandby, quoteCancellation, requestCancellation, decideCancellation, openDispute, addDisputeEntry, acceptDisputeResolution, createEmergencyRequest, respondEmergency, acceptEmergency, cancelEmergency, saveEmergencyProfile, payBooking |
| `src/lib/media/actions.ts` | 11 | createDesign, saveDesign, restoreVersion, deriveDesign, archiveDesign, publishTemplate, reportTemplate, eventDataFor, businessDataFor, listTemplates, templateUsed |
| `src/lib/media/collab.ts` | 5 | saveBrandKit, listComments, addComment, resolveComment, deleteComment |
| `src/lib/media/design-actions.ts` | 1 | restoreDesign |
| `src/lib/media/elements.ts` | 4 | listElements, saveElement, updateElement, deleteElement |
| `src/lib/messaging/actions.ts` | 5 | startConversation, sendMessage, markRead, contactProfile, setSavedContact |
| `src/lib/mfa/actions.ts` | 3 | generateRecoveryCodes, recordFactorChange, setWorkspaceMfaPolicy |
| `src/lib/tickets/actions.ts` | 4 | offerTransfer, acceptTransfer, cancelTransfer, joinWaitlist |
| `src/lib/tickets/scan.ts` | 4 | scanCredential, scanManifest, scanLookup, syncOfflineScans |
| `src/lib/venue/actions.ts` | 15 | quoteVenue, placeVenueHold, offerAlternative, decideAlternative, saveRateCard, deleteRateCard, saveEventOrder, approveEventOrder, saveMenu, saveMenuSection, saveMenuItem, deleteMenuRow, saveBarPackage, saveCatering, priceCatering |
| `src/lib/virtual/actions.ts` | 1 | saveVirtual |

## Route handlers

Guard column is detected from the handler source (keywords) — layouts do **not** protect route handlers, so each must check auth itself. "token" = capability token / signed URL in the path or query. Flagged items are discussed in FINDINGS.md.

| Route | Methods | Guard detected | File |
|---|---|---|---|
| `/admin/agent-integrations/export` | GET | getAdmin | `src/app/admin/(console)/agent-integrations/export/route.ts` |
| `/admin/analytics/export` | GET | getAdmin | `src/app/admin/(console)/analytics/export/route.ts` |
| `/admin/commerce/export` | GET | getAdmin | `src/app/admin/(console)/commerce/export/route.ts` |
| `/admin/events/export` | GET | requireAdminPermission | `src/app/admin/(console)/events/export/route.ts` |
| `/admin/marketplace/export` | GET | requireAdminPermission | `src/app/admin/(console)/marketplace/export/route.ts` |
| `/admin/partners/export` | GET | getAdmin | `src/app/admin/(console)/partners/export/route.ts` |
| `/admin/settings/export` | GET | getAdmin | `src/app/admin/(console)/settings/export/route.ts` |
| `/admin/support/export` | GET | getAdmin | `src/app/admin/(console)/support/export/route.ts` |
| `/admin/tickets/export` | GET | requireAdminPermission | `src/app/admin/(console)/tickets/export/route.ts` |
| `/admin/trust/export` | GET | getAdmin | `src/app/admin/(console)/trust/export/route.ts` |
| `/admin/users/export` | GET | requireAdminPermission | `src/app/admin/(console)/users/export/route.ts` |
| `/admin/workspaces/export` | GET | requireAdminPermission | `src/app/admin/(console)/workspaces/export/route.ts` |
| `/partner/qr` | GET | auth.getUser | `src/app/partner/qr/route.ts` |
| `/partner/resources/[slug]` | GET | auth.getUser | `src/app/partner/resources/[slug]/route.ts` |
| `/api/account/avatar` | POST | auth.getUser writes | `src/app/api/account/avatar/route.ts` |
| `/api/account/export` | GET | auth.getUser | `src/app/api/account/export/route.ts` |
| `/api/agent/ask` | POST | auth.getUser writes | `src/app/api/agent/ask/route.ts` |
| `/api/agent/onboarding` | POST | auth.getUser token writes | `src/app/api/agent/onboarding/route.ts` |
| `/api/agent/provider` | POST | getProvider writes | `src/app/api/agent/provider/route.ts` |
| `/api/agent/worker` | GET/POST | CRON_SECRET writes | `src/app/api/agent/worker/route.ts` |
| `/api/auth/google/callback` | GET | token | `src/app/api/auth/google/callback/route.ts` |
| `/api/auth/google/start` | POST | token writes | `src/app/api/auth/google/start/route.ts` |
| `/api/auth/mfa-recover` | POST | auth.getUser writes | `src/app/api/auth/mfa-recover/route.ts` |
| `/api/boosts/[id]/click` | GET | none | `src/app/api/boosts/[id]/click/route.ts` |
| `/api/calendar/[token]` | GET | token | `src/app/api/calendar/[token]/route.ts` |
| `/api/calendar/oauth/[provider]/callback` | GET | auth.getUser token | `src/app/api/calendar/oauth/[provider]/callback/route.ts` |
| `/api/calendar/oauth/[provider]/start` | GET | auth.getUser | `src/app/api/calendar/oauth/[provider]/start/route.ts` |
| `/api/calendar/sync` | POST | auth.getUser writes | `src/app/api/calendar/sync/route.ts` |
| `/api/checkout/complete` | GET | none | `src/app/api/checkout/complete/route.ts` |
| `/api/checkout/session` | POST | auth.getUser token writes | `src/app/api/checkout/session/route.ts` |
| `/api/cron/calendar-sync` | POST/GET | CRON_SECRET writes | `src/app/api/cron/calendar-sync/route.ts` |
| `/api/cron/email` | POST/GET | CRON_SECRET writes | `src/app/api/cron/email/route.ts` |
| `/api/cron/payments` | POST/GET | CRON_SECRET writes | `src/app/api/cron/payments/route.ts` |
| `/api/cron/privacy` | POST/GET | CRON_SECRET writes | `src/app/api/cron/privacy/route.ts` |
| `/api/cron/scan-uploads` | POST/GET | CRON_SECRET writes | `src/app/api/cron/scan-uploads/route.ts` |
| `/api/cron/storage-backup` | POST/GET | CRON_SECRET writes | `src/app/api/cron/storage-backup/route.ts` |
| `/api/cron/webhooks` | POST/GET | CRON_SECRET writes | `src/app/api/cron/webhooks/route.ts` |
| `/api/dev/design` | GET | none | `src/app/api/dev/design/route.ts` |
| `/api/dev/designs` | GET | none | `src/app/api/dev/designs/route.ts` |
| `/api/disputes/[id]/files` | GET | auth.getUser | `src/app/api/disputes/[id]/files/route.ts` |
| `/api/enquiries` | POST | auth.getUser writes | `src/app/api/enquiries/route.ts` |
| `/api/events/[id]/queue` | POST/GET | token writes | `src/app/api/events/[id]/queue/route.ts` |
| `/api/export/[kind]` | GET | auth.getUser | `src/app/api/export/[kind]/route.ts` |
| `/api/files/[id]` | GET | auth.getUser | `src/app/api/files/[id]/route.ts` |
| `/api/health` | GET | CRON_SECRET | `src/app/api/health/route.ts` |
| `/api/invites` | POST | auth.getUser token writes | `src/app/api/invites/route.ts` |
| `/api/listing-media` | POST | getProvider auth.getUser writes | `src/app/api/listing-media/route.ts` |
| `/api/maintenance` | GET | none | `src/app/api/maintenance/route.ts` |
| `/api/maps/geocode` | GET | auth.getUser | `src/app/api/maps/geocode/route.ts` |
| `/api/maps/tile/[style]/[z]/[x]/[y]` | GET | none | `src/app/api/maps/tile/[style]/[z]/[x]/[y]/route.ts` |
| `/api/mcp` | POST/GET | authenticate( writes | `src/app/api/mcp/route.ts` |
| `/api/media/asset` | GET | auth.getUser | `src/app/api/media/asset/route.ts` |
| `/api/media/font` | POST/GET/DELETE | auth.getUser writes | `src/app/api/media/font/route.ts` |
| `/api/messages/[id]/files` | GET | auth.getUser | `src/app/api/messages/[id]/files/route.ts` |
| `/api/onboarding` | POST | auth.getUser token writes | `src/app/api/onboarding/route.ts` |
| `/api/payouts` | POST/GET | auth.getUser writes | `src/app/api/payouts/route.ts` |
| `/api/recent` | POST | auth.getUser writes | `src/app/api/recent/route.ts` |
| `/api/requests/[id]/files` | GET | auth.getUser | `src/app/api/requests/[id]/files/route.ts` |
| `/api/saved` | POST | auth.getUser writes | `src/app/api/saved/route.ts` |
| `/api/search` | GET | auth.getUser | `src/app/api/search/route.ts` |
| `/api/stripe/webhook` | POST | token writes | `src/app/api/stripe/webhook/route.ts` |
| `/api/tickets/[id]/credential` | GET | auth.getUser token | `src/app/api/tickets/[id]/credential/route.ts` |
| `/api/tickets/[id]/ics` | GET | auth.getUser | `src/app/api/tickets/[id]/ics/route.ts` |
| `/api/tickets/[id]/pdf` | GET | none | `src/app/api/tickets/[id]/pdf/route.ts` |
| `/api/uploads` | POST | auth.getUser writes | `src/app/api/uploads/route.ts` |
| `/api/v1/openapi.json` | GET | apiKey | `src/app/api/v1/openapi.json/route.ts` |
| `/api/v1/tools` | GET | authenticate( | `src/app/api/v1/tools/route.ts` |
| `/api/v1/tools/[tool]` | POST | authenticate( writes | `src/app/api/v1/tools/[tool]/route.ts` |
| `/tickets/[id]/join` | GET | auth.getUser | `src/app/tickets/[id]/join/route.ts` |
| `/continue` | GET | none | `src/app/continue/route.ts` |
| `/portal/[token]/documents/[id]` | GET | token | `src/app/portal/[token]/documents/[id]/route.ts` |
| `/r/[code]` | GET | none | `src/app/r/[code]/route.ts` |
| `/provider/bookings/export` | GET | getProvider | `src/app/provider/bookings/export/route.ts` |
| `/provider/money/export` | GET | getProvider | `src/app/provider/money/export/route.ts` |
| `/auth/callback` | GET | none | `src/app/auth/callback/route.ts` |
| `/auth/confirm` | GET | token | `src/app/auth/confirm/route.ts` |
| `/auth/continue` | GET | none | `src/app/auth/continue/route.ts` |
| `/auth/signout` | POST | writes | `src/app/auth/signout/route.ts` |

Handlers with no auth keyword, and why: `/api/boosts/[id]/click` (public ad click counter → redirect), `/api/checkout/complete` (Stripe success redirect; looks up by `cs_…` session id and calls `finalise()`, which re-verifies), `/api/dev/design`, `/api/dev/designs` (404 unless `NODE_ENV=development`), `/api/maintenance` (public status), `/api/maps/tile/...` (tile proxy), `/api/tickets/[id]/pdf` (auth inside `loadPrintable()` in `src/lib/tickets/printable.ts`), `/continue`, `/r/[code]` (referral redirect), `/auth/callback`, `/auth/continue`, `/auth/signout`.

## Cron and jobs

| pg_cron job | Schedule | Target | What it does |
|---|---|---|---|
| payments-worker | `*/5 * * * *` | `/api/cron/payments` | `processPayments()` (release scan → Stripe transfers → cancellation refunds + transfer reversals), ticket refunds, resale refunds |
| agent-worker | `* * * * *` | `/api/agent/worker` | durable Gala Agent runs, waits, watches, routines |
| email-outbox | `*/2 * * * *` | `/api/cron/email` | sends `email_outbox` via Resend |
| privacy-deletions | `17 2 * * *` | `/api/cron/privacy` | DSAR erasure after grace period |
| webhook-deliveries | `* * * * *` | `/api/cron/webhooks` | outbound developer webhooks with retries |
| storage-backup | `*/15 * * * *` | `/api/cron/storage-backup` | Supabase Storage → R2 `storage/<bucket>/<name>` |
| scan-uploads | `*/5 * * * *` | `/api/cron/scan-uploads` | ClamAV gateway scan of pending uploads; quarantine/removal |
| calendar-sync | `17 * * * *` | `/api/cron/calendar-sync` | Google/Microsoft two-way calendar sync |
| db-backup | `*/10 2-3 * * *` | Edge Function `db-backup` | nightly NDJSON.gz table dumps → R2 `db-backups/<date>/` |
| marketplace-sweep | `*/5 * * * *` | SQL `marketplace_sweep()` | expire holds/quotes/requests |
| waitlist-notify | `*/5 * * * *` | SQL `notify_waitlists()` | ticket waitlist notifications |
| boost-lifecycle | `*/5 * * * *` | SQL `boost_lifecycle()` | start/end paid placements |
| break-glass-expire | `*/15 * * * *` | SQL `bg_expire()` | expire admin break-glass grants |
| break-glass-retention | `30 3 1 * *` | SQL `bg_purge()` | purge old break-glass logs |
| agent-retention | `15 4 2 * *` | SQL `agent_retention_purge()` | agent data retention |
| retention-security-logs | `45 3 2 * *` | SQL `retention_purge_security_logs()` | security log retention |

There is no generic `job_queue` / `dead_letter_jobs` / `domain_outbox`: each domain has its own queue table or status column (email_outbox, webhook_deliveries, payment_orders.status, booking_cancellations.refund_status, resale_payouts, privacy_requests, agent_runs/agent_waits). There is no Vercel cron (`vercel.json` absent); all scheduling is pg_cron + pg_net, so the workers only run against the URL `dispatch_worker()` is configured with (deployed site), never the local dev server.

## Webhooks

**Inbound — Stripe** (`src/app/api/stripe/webhook/route.ts`): HMAC-SHA256 verify against any of 4 secrets; exactly-once claim via `claim_webhook_event` / `finish_webhook_event` (`webhook_events`, 410 rows). Handled types:

| Stripe event | Effect |
|---|---|
| `checkout.session.completed`, `.async_payment_succeeded` (metadata `order_ref`) | `finalise()` ticket order → issue tickets |
| `checkout.session.expired` | release ticket holds; or `payment_order_failed` |
| `payment_intent.succeeded` | `payment_order_succeeded` (marketplace) or `ledgerForTicketPayment` (tickets/resale) |
| `payment_intent.payment_failed` | `payment_order_failed` |
| `charge.refunded` | `ledgerForRefund` + `payment_order_refunded` |
| `account.updated` | `syncConnectAccount` (Connect status → `connect_accounts`, `workspaces.payout_status`) |
| `charge.dispute.*` | `syncStripeDispute` (+ support case) + `payment_order_disputed` |

Not handled: invoice payments (`metadata.invoice_id` from `/pay/[token]`) — recorded only when the payer returns to the page (see FINDINGS F-03); `transfer.*`, `payout.*`, `account.application.deauthorized`, `capability.updated`, `charge.dispute.funds_*` beyond the generic prefix.

**Outbound — developer webhooks**: event types `event.created/updated/published`, `booking.requested/created/confirmed/cancelled/cancellation_applied`, `quote.received/accepted`, `proposal.accepted`, `ticket.order.paid/transferred/resold`, `payment.succeeded/refunded`, `dispute.opened`, `agent.run.completed`, `listing.published`, `review.published`, `provider.document.expiring` (`src/lib/developer/actions.ts:12`).

## Gala Agent tools

Columns: id · title · surface · risk (0 read … 4 binding) · permission · mutation. Registry `src/lib/agent/registry.ts` (Zod input schemas, executes as the human through RLS); runtime `src/lib/agent/runtime.ts`; LLM `src/lib/agent/llm.ts` (Azure OpenAI, metered against `ai_usage_events` / `ai_credit_ledger`). Exposed to REST/MCP through `src/lib/developer/gateway.ts`.

| Tool | Title | Surface | Risk | Permission | Mutates |
|---|---|---|---|---|---|
| `events.list` | List events | organizer | 0 | events.read | false | true |
| `event.readiness` | Event readiness | organizer | 0 | events.read | false | true |
| `event.feasibility` | Feasibility check | organizer | 0 | events.read | false | true |
| `event.budget` | Event budget | organizer | 0 | events.read | false | true |
| `marketplace.open_requests` | Open supplier requests | organizer | 0 | events.read | false | true |
| `marketplace.search` | Search marketplace | organizer | 0 | marketplace.request | false | true |
| `team.conflicts` | Team conflicts | organizer | 0 | events.read | false | true |
| `tickets.sales` | Ticket sales | organizer | 0 | events.read | false | true |
| `venues.rank` | Rank venues | organizer | 0 | events.read | false | true |
| `event.break_even` | Break-even | organizer | 0 | events.read | false | true |
| `seating.suggest` | Suggest seating | organizer | 0 | events.read | false | true |
| `money.payables` | Payables | organizer | 0 | finance.read | false | true |
| `draft.note` | Draft | both | 1 | events.read | true | true |
| `task.create` | Create task | organizer | 2 | events.write | true | true |
| `media.list_designs` | List designs | both | 0 | events.read | false | true |
| `media.event_poster` | Draft event poster | organizer | 1 | events.write | true | true |
| `message.party` | Send message | both | 3 | events.read | true | false |
| `marketplace.request_hold` | Request a hold | organizer | 3 | marketplace.request | true | false |
| `marketplace.request_standby` | Request paid standby | organizer | 3 | marketplace.request | true | false |
| `emergency.create` | Emergency Supply request | organizer | 3 | marketplace.request | true | false |
| `standby.activate` | Activate standby | organizer | 4 | marketplace.request | true | false |
| `cancellation.request` | Cancel a booking | organizer | 4 | marketplace.request | true | false |
| `tickets.publish_tier` | Put tickets on sale | organizer | 4 | tickets.manage | true | false |
| `opportunities.list` | Open opportunities | provider | 0 | opportunities.read | false | true |
| `calendar.conflicts` | Check availability | provider | 0 | opportunities.read | false | true |
| `money.provider_summary` | Payout summary | provider | 0 | money.read | false | true |
| `reliability.get` | Reliability | provider | 0 | opportunities.read | false | true |
| `opportunity.respond` | Respond to request | provider | 3 | opportunities.respond | true | false |
| `venue.hold` | Hold a space | provider | 3 | availability.manage | true | false |
| `quote.send` | Send a quote | provider | 4 | quotes.send | true | false |

Two further AI paths sit **outside** this registry and its metering: the provider assistant `src/lib/provider/agent.ts:42-45` and onboarding assistant `src/app/api/agent/onboarding/route.ts:21-36`, both calling Anthropic (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`) directly (FINDINGS F-07).

## Feature flags and configuration

There is no `feature_flags` or `config_registry` table. Switches in use:

| Mechanism | Where | Purpose |
|---|---|---|
| `platform_settings` (19 rows, versioned with `status`/`approved_by`/`effective_at`) | admin settings | commerce fees, VAT, resale caps, policies — the closest thing to a config registry |
| `plan_entitlements` (64 rows) | `src/lib/plan-model.ts`, storage quota, Agent gating | per-plan limits/modules (plan-level, not per-workspace) |
| `maintenance_windows` + `src/lib/maintenance-modules.ts` | `src/proxy.ts` | maintenance levels M1–M4 and per-module write freezes |
| `GALA_ENABLE_PREVIEWS` | `src/lib/preview-data.ts:8` | deterministic preview data routes outside production |
| `GALA_PWA_BUILD`, `GALA_PWA_DIAGNOSTICS` | `next.config.ts`, `src/lib/actions/marketplace.ts` | PWA build/diagnostic switches |
| `NODE_ENV` | 16 sites | dev-only routes (`/api/dev/*`), sandbox Stripe key fallback |
| Workspace `settings` jsonb, `events.resale_enabled` etc. | per record | per-tenant toggles |

## Storage

| Bucket | Public | Size limit | MIME | Used by |
|---|---|---|---|---|
| `avatars` | yes | 5 MB | png/jpeg/webp | `/api/account/avatar` |
| `event-media` | yes | 10 MB | png/jpeg/webp | event covers, posters, Media Studio exports |
| `listing-media` | yes | 10 MB | png/jpeg/webp | `/api/listing-media` |
| `workspace-files` | **private** | 10 MB | pdf, fonts, images incl. svg | request/message/dispute attachments, portal documents, fonts, event files (signed URLs, `verified_private_uploads` binding) |

Storage policies (live): avatars insert/delete; event_media select/insert/delete; listing_media select/insert/delete; workspace_files read/upload/delete. Uploads pass `src/lib/upload-safety.ts` (metadata strip, PDF active-content refusal) and are scanned asynchronously by `scan-uploads` (ClamAV gateway in `blackwellen-operations`). Usage is attributed per workspace (`storage_attribution`).

Cloudflare R2 (`src/lib/r2.ts`, SigV4, EU jurisdiction): used **only for backups** — `storage/<bucket>/<object>` (replica of Supabase Storage, `storage_backups`) and `db-backups/<YYYY-MM-DD>/<schema>.<table>.ndjson.gz` + `manifest.json` (Edge Function). No user-facing media is served from R2.

## External integrations and env vars (names only)

| Integration | Code | Env vars | Local `.env*` status |
|---|---|---|---|
| Supabase (DB, auth, storage) | `src/lib/supabase/*` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (edge fn); ops: `SUPABASE_PROJECT_REF`, `SUPABASE_PAT_KEY` | set (URL via config fallback) |
| Stripe (Checkout, Connect, refunds, transfers, SetupIntents) | `src/lib/stripe.ts`, `src/lib/commerce/*`, `/api/checkout/session`, `/api/payouts`, `/pay/[token]` | `STRIPE_CONNECT_SECRET_KEY` (live/prod), `STRIPE_SECRET_KEY_SANDBOX` (non-prod fallback), `STRIPE_PUBLIC_KEY`, `STRIPE_PUBLIC_KEY_SANDBOX`, `STRIPE_WEBHOOK_SECRET`, `_CONNECT`, `_SANDBOX`, `_SANDBOX_CONNECT` | sandbox only; `STRIPE_CONNECT_SECRET_KEY` not set locally |
| Scheduled workers | `/api/cron/*`, `/api/health` | `CRON_SECRET` | set |
| Ticket credential signing | `src/lib/tickets/credentials.ts` | `TICKET_QR_SECRET` | set |
| Azure OpenAI (Gala Agent) | `src/lib/agent/llm.ts` | `AZURE_OPENAI_API_KEY` (`AZURE_OPENAI_KEY` alias in settings page), `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`, `AGENT_MODEL_MINI`, `AGENT_MODEL_NANO`, `AGENT_MODEL_DEEP` | set (no DEEP) |
| Anthropic (provider + onboarding assistants) | `src/lib/provider/agent.ts`, `/api/agent/onboarding` | `ANTHROPIC_API_KEY` | **not set** → those assistants report unavailable |
| Resend (email) | `src/lib/email/send.ts` | `RESEND_API_KEY` (or `RESEND_API`), `EMAIL_FROM`, `EMAIL_REPLY_TO` | `RESEND_API` set; SMTP_* also present but unused by code |
| MapTiler + OSM/Nominatim | `/api/maps/*`, `src/app/provider/venues/new/actions.ts:30`, `src/components/workspace/coverage-map.tsx:19` | `MAP_TILER_API_KEY` (OSM fallback needs none) | set |
| Cloudflare R2 (backups) | `src/lib/r2.ts`, edge fn | `CLOUDFLARE_R2_S3_API`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_JURISDICTION`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (health registry checks `CLOUDFLARE_R2_ACCOUNT_ID` instead) | set |
| ClamAV gateway (shared ops) | `src/lib/upload-safety.ts`, `/api/cron/scan-uploads` | `CLAMAV_SCAN_URL`, `CLAMAV_SCAN_TOKEN` | **not set** (BLOCKED_EXTERNAL, Q04) |
| Sentry/GlitchTip | `src/instrumentation.ts` | `SENTRY_DSN` | not set |
| Google sign-in | `src/lib/google-auth.ts`, `/api/auth/google/*` | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (or `GOOGLE_OAUTH_CLIENT_*`) | set |
| Calendar sync (Google / Microsoft Graph, ICS feed) | `src/lib/calendar-sync/providers.ts`, `/api/calendar/*` | `GOOGLE_CALENDAR_CLIENT_ID/SECRET`, `MICROSOFT_CALENDAR_CLIENT_ID/SECRET/TENANT`, `CALENDAR_TOKEN_KEY` | not set (ICS fallback works) |
| Cloudflare Turnstile | auth forms | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | site key **blanked** (release blocker T2) |
| Site / deploy | various | `NEXT_PUBLIC_SITE_URL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` | — |

The admin health registry `src/lib/release/integrations.ts` is the runtime source of integration status; it disagrees with the code in three places (FINDINGS F-11).
