# Gala Dock system inventory

Generated 2026-10-11 17:24 UTC by `scripts/release-inventory.mjs` from the codebase and the live database catalogue. Regenerate before each release.

## Summary

| Item | Count |
|---|---|
| Pages (routes) | 165 |
| API endpoints | 66 |
| Server actions | 329 |
| Database tables (public) | 160 |
| Tables with RLS enabled | 160 / 160 |
| RLS policies | 211 |
| SQL functions (public) | 627 (346 security definer) |
| Triggers | 36 |
| Scheduled jobs | 12 |
| Storage buckets | 4 |
| Agent tools | 27 |
| Test files / tests | 44 / 150 |

## Pages by portal

### Public (23)

`/[...slug]` · `/checkout/[event]` · `/checkout/[event]/confirmation` · `/cookies` · `/data-retention` · `/events/[slug]` · `/help` · `/help/[slug]` · `/home` · `/maintenance` · `/messages/[id]` · `/page.tsx` · `/pay/[token]` · `/payments/[ref]` · `/privacy` · `/proposal/[token]` · `/r/[code]/consent` · `/services/[slug]` · `/studio/[id]` · `/terms` · `/ticket-terms` · `/venues/[slug]` · `/verify-email`

### Auth/Onboarding (9)

`/access` · `/forgot-password` · `/invite/[token]` · `/login` · `/mfa` · `/onboarding` · `/onboarding/[flow]` · `/register` · `/reset-password`

### Customer (23)

`/account` · `/account/disputes/[id]` · `/account/events` · `/account/events/[id]` · `/account/events/[id]/book` · `/account/events/[id]/bookings/[item]` · `/account/events/[id]/bookings/[item]/catering` · `/account/events/[id]/build` · `/account/events/[id]/guests-tickets` · `/account/events/[id]/messages` · `/account/events/[id]/money` · `/account/events/[id]/plan` · `/account/events/[id]/scan` · `/account/events/[id]/tickets/setup` · `/account/inbox` · `/account/reviews` · `/account/saved` · `/account/tickets` · `/account/tickets/[id]` · `/account/tickets/[id]/print` · `/discover` · `/plan` · `/tickets/accept/[token]`

### Organizer (40)

`/organizer` · `/organizer/agent` · `/organizer/agent/policy` · `/organizer/calendar` · `/organizer/disputes/[id]` · `/organizer/events` · `/organizer/events/[id]` · `/organizer/events/[id]/live` · `/organizer/events/[id]/map` · `/organizer/events/[id]/media` · `/organizer/events/[id]/page` · `/organizer/events/[id]/promotion` · `/organizer/events/[id]/scan` · `/organizer/events/[id]/template` · `/organizer/events/[id]/tickets/setup` · `/organizer/events/[id]/virtual` · `/organizer/events/new` · `/organizer/inbox` · `/organizer/marketplace` · `/organizer/marketplace/[type]/[id]` · `/organizer/marketplace/bookings/[id]` · `/organizer/marketplace/bookings/[id]/catering` · `/organizer/marketplace/emergency` · `/organizer/marketplace/emergency/[id]` · `/organizer/marketplace/requests/[id]` · `/organizer/marketplace/requests/new` · `/organizer/media` · `/organizer/money` · `/organizer/money/invoices/[id]` · `/organizer/money/invoices/new` · `/organizer/promotions/new` · `/organizer/proposals/new` · `/organizer/sales` · `/organizer/sales/leads/[id]` · `/organizer/sales/proposals/[id]` · `/organizer/settings` · `/organizer/team` · `/organizer/team/[id]` · `/organizer/tickets` · `/organizers/[slug]`

### Provider (36)

`/provider` · `/provider/agent` · `/provider/agent/policy` · `/provider/beo/[id]` · `/provider/bookings` · `/provider/bookings/[id]` · `/provider/bookings/new` · `/provider/calendar` · `/provider/disputes/[id]` · `/provider/emergency` · `/provider/emergency/[id]` · `/provider/inbox` · `/provider/listings/[[...type]]` · `/provider/media` · `/provider/menus` · `/provider/menus/[id]` · `/provider/messages/[id]` · `/provider/money` · `/provider/money/statement` · `/provider/opportunities` · `/provider/opportunities/[id]` · `/provider/opportunities/[id]/quote` · `/provider/packages/[id]` · `/provider/packages/new` · `/provider/quotes/[id]` · `/provider/quotes/[id]/print` · `/provider/search` · `/provider/services/[id]` · `/provider/services/new` · `/provider/settings` · `/provider/team` · `/provider/team/[id]` · `/provider/venues/[id]` · `/provider/venues/[id]/spaces/[spaceId]` · `/provider/venues/[id]/spaces/new` · `/provider/venues/new`

### Portals (4)

`/partner` · `/portal/[token]` · `/promoter` · `/promoter/[promoterId]`

### Admin (30)

`/admin` · `/admin/agent-integrations` · `/admin/agent-integrations/credits` · `/admin/analytics` · `/admin/commerce` · `/admin/commerce/payouts` · `/admin/commerce/transactions/[id]` · `/admin/conversations` · `/admin/conversations/[grant]` · `/admin/conversations/request` · `/admin/disputes` · `/admin/events` · `/admin/health` · `/admin/login` · `/admin/maintenance` · `/admin/marketplace` · `/admin/marketplace/listings/[id]` · `/admin/partners` · `/admin/settings` · `/admin/support` · `/admin/support/[id]` · `/admin/support/privacy` · `/admin/tickets` · `/admin/trust` · `/admin/trust/[id]` · `/admin/trust/disputes` · `/admin/users` · `/admin/users/[id]` · `/admin/workspaces` · `/admin/workspaces/[id]`

## API endpoints

| Route | Methods | Auth | File |
|---|---|---|---|
| `/admin/agent-integrations/export` | GET | session | src/app/admin/(console)/agent-integrations/export/route.ts |
| `/admin/analytics/export` | GET | session | src/app/admin/(console)/analytics/export/route.ts |
| `/admin/commerce/export` | GET | session | src/app/admin/(console)/commerce/export/route.ts |
| `/admin/events/export` | GET | session | src/app/admin/(console)/events/export/route.ts |
| `/admin/marketplace/export` | GET | session | src/app/admin/(console)/marketplace/export/route.ts |
| `/admin/partners/export` | GET | session | src/app/admin/(console)/partners/export/route.ts |
| `/admin/settings/export` | GET | session | src/app/admin/(console)/settings/export/route.ts |
| `/admin/support/export` | GET | session | src/app/admin/(console)/support/export/route.ts |
| `/admin/tickets/export` | GET | session | src/app/admin/(console)/tickets/export/route.ts |
| `/admin/trust/export` | GET | session | src/app/admin/(console)/trust/export/route.ts |
| `/admin/users/export` | GET | session | src/app/admin/(console)/users/export/route.ts |
| `/admin/workspaces/export` | GET | session | src/app/admin/(console)/workspaces/export/route.ts |
| `/api/account/avatar` | POST | session | src/app/api/account/avatar/route.ts |
| `/api/account/export` | GET | session | src/app/api/account/export/route.ts |
| `/api/agent/ask` | POST | session | src/app/api/agent/ask/route.ts |
| `/api/agent/onboarding` | POST | session | src/app/api/agent/onboarding/route.ts |
| `/api/agent/provider` | POST | session | src/app/api/agent/provider/route.ts |
| `/api/agent/worker` | GET, POST | cron bearer | src/app/api/agent/worker/route.ts |
| `/api/auth/mfa-recover` | POST | session | src/app/api/auth/mfa-recover/route.ts |
| `/api/calendar/[token]` | GET | token | src/app/api/calendar/[token]/route.ts |
| `/api/checkout/complete` | GET | public | src/app/api/checkout/complete/route.ts |
| `/api/checkout/session` | POST | session | src/app/api/checkout/session/route.ts |
| `/api/cron/email` | GET, POST | cron bearer | src/app/api/cron/email/route.ts |
| `/api/cron/payments` | GET, POST | cron bearer | src/app/api/cron/payments/route.ts |
| `/api/cron/privacy` | GET, POST | cron bearer | src/app/api/cron/privacy/route.ts |
| `/api/cron/storage-backup` | GET, POST | cron bearer | src/app/api/cron/storage-backup/route.ts |
| `/api/cron/webhooks` | GET, POST | cron bearer | src/app/api/cron/webhooks/route.ts |
| `/api/dev/design` | GET | dev only | src/app/api/dev/design/route.ts |
| `/api/dev/designs` | GET | dev only | src/app/api/dev/designs/route.ts |
| `/api/disputes/[id]/files` | GET | session | src/app/api/disputes/[id]/files/route.ts |
| `/api/enquiries` | POST | session | src/app/api/enquiries/route.ts |
| `/api/events/[id]/queue` | GET, POST | public | src/app/api/events/[id]/queue/route.ts |
| `/api/export/[kind]` | GET | session | src/app/api/export/[kind]/route.ts |
| `/api/files/[id]` | GET | session | src/app/api/files/[id]/route.ts |
| `/api/health` | GET | cron bearer | src/app/api/health/route.ts |
| `/api/invites` | POST | session | src/app/api/invites/route.ts |
| `/api/listing-media` | POST | session | src/app/api/listing-media/route.ts |
| `/api/maintenance` | GET | public | src/app/api/maintenance/route.ts |
| `/api/mcp` | GET, POST | API key | src/app/api/mcp/route.ts |
| `/api/media/asset` | GET | session | src/app/api/media/asset/route.ts |
| `/api/messages/[id]/files` | GET | session | src/app/api/messages/[id]/files/route.ts |
| `/api/onboarding` | POST | session | src/app/api/onboarding/route.ts |
| `/api/payouts` | GET, POST | session | src/app/api/payouts/route.ts |
| `/api/recent` | POST | session | src/app/api/recent/route.ts |
| `/api/saved` | POST | session | src/app/api/saved/route.ts |
| `/api/search` | GET | session | src/app/api/search/route.ts |
| `/api/stripe/webhook` | POST | signature | src/app/api/stripe/webhook/route.ts |
| `/api/tickets/[id]/credential` | GET | session | src/app/api/tickets/[id]/credential/route.ts |
| `/api/tickets/[id]/ics` | GET | session | src/app/api/tickets/[id]/ics/route.ts |
| `/api/tickets/[id]/pdf` | GET | session | src/app/api/tickets/[id]/pdf/route.ts |
| `/api/uploads` | POST | session | src/app/api/uploads/route.ts |
| `/api/v1/openapi.json` | GET | public | src/app/api/v1/openapi.json/route.ts |
| `/api/v1/tools` | GET | API key | src/app/api/v1/tools/route.ts |
| `/api/v1/tools/[tool]` | POST | API key | src/app/api/v1/tools/[tool]/route.ts |
| `/auth/callback` | GET | public | src/app/auth/callback/route.ts |
| `/auth/confirm` | GET | public | src/app/auth/confirm/route.ts |
| `/auth/continue` |  | public | src/app/auth/continue/route.ts |
| `/auth/signout` | POST | public | src/app/auth/signout/route.ts |
| `/continue` | GET | public | src/app/continue/route.ts |
| `/partner/qr` | GET | session | src/app/partner/qr/route.ts |
| `/partner/resources/[slug]` | GET | session | src/app/partner/resources/[slug]/route.ts |
| `/portal/[token]/documents/[id]` | GET | token | src/app/portal/[token]/documents/[id]/route.ts |
| `/provider/bookings/export` | GET | session | src/app/provider/bookings/export/route.ts |
| `/provider/money/export` | GET | session | src/app/provider/money/export/route.ts |
| `/r/[code]` | GET | public | src/app/r/[code]/route.ts |
| `/tickets/[id]/join` | GET | session | src/app/tickets/[id]/join/route.ts |

## Server actions (329)

* `src/app/admin/(console)/agent-integrations/credits/actions.ts`: grantCredits
* `src/app/admin/(console)/conversations/actions.ts`: requestAccess, decideAccess, openConversation, touchConversation, closeAccess
* `src/app/admin/(console)/disputes/actions.ts`: adminUpdateDispute, adminDecideCancellation
* `src/app/admin/(console)/maintenance/actions.ts`: startMaintenance, endMaintenance
* `src/app/admin/(console)/support/privacy/actions.ts`: updatePrivacyRequest
* `src/app/admin/(console)/_a/actions.ts`: setUserStatus, revokeSessions, addRecordNote, setWorkspaceStatus, setWorkspacePlan, setWorkspaceCommission, reviewListing, setEventRestriction, setEventFeatured, setTicketSales
* `src/app/admin/(console)/_b/actions.ts`: requestRefund, retryPayout, cancelMoneyRequest, addNote, createSupportCase, replyCase, assignCase, setCaseStatus, resolveCase, decideTrust, assignTrust, requestEvidence, createTrustCase, setPartnerStatus, setPartnerTerms, requestPartnerPayout, decideAgentApproval, controlRun, startAdminRun, setIntegration, saveSettingsDraft, publishSettingsDraft, discardSettingsDraft, rollbackSetting
* `src/app/checkout/[event]/actions.ts`: reserve, releaseHold, reserveResale, claimOffer
* `src/app/organizer/events/[id]/map/actions.ts`: saveEventPlan
* `src/app/partner/actions.ts`: contactSupport
* `src/app/portal/[token]/actions.ts`: decideApproval, postComment
* `src/app/promoter/actions.ts`: setPayoutMethod
* `src/app/proposal/[token]/actions.ts`: acceptProposal
* `src/app/provider/actions.ts`: switchProviderWorkspace
* `src/app/provider/agent/actions.ts`: decideApproval, toggleRoutine, controlRun, startRun
* `src/app/provider/bookings/actions.ts`: transitionBooking, assignCrew, raiseIssue, requestChange
* `src/app/provider/bookings/new/actions.ts`: saveBookingStep, discardBookingDraft, confirmBooking
* `src/app/provider/bookings/[id]/actions.ts`: recordBookingFile
* `src/app/provider/calendar/actions.ts`: setAvailability
* `src/app/provider/listings/actions.ts`: publishListing, pauseListing, duplicateListing, setSpaceStatus, setPackageStatus
* `src/app/provider/messages/actions.ts`: sendThreadMessage
* `src/app/provider/opportunities/actions.ts`: respondToRequest, releaseHold
* `src/app/provider/opportunities/[id]/actions.ts`: offerOption, askClarification, addInternalNote, toggleSaved
* `src/app/provider/opportunities/[id]/quote/actions.ts`: saveQuoteDraft, sendQuote
* `src/app/provider/packages/actions.ts`: savePackageOffer, savePackagePricing, savePackageAvailability, savePackagePhotos, setPackageLive, duplicatePackage
* `src/app/provider/quotes/actions.ts`: sendDraftQuote, withdrawQuote
* `src/app/provider/services/actions.ts`: saveServiceBasics, saveServicePricing, saveServiceAvailability, saveServicePackage, saveServiceInfo
* `src/app/provider/settings/actions.ts`: saveProfile, setCapability, saveBooking, saveComms, saveNotifications, saveAgent, saveTax, inviteMember, revokeInvite
* `src/app/provider/settings/_components/credentials-actions.ts`: submitCredential
* `src/app/provider/team/actions.ts`: saveCrew, setCrewStatus, addCrewUnavailability, requestAvailability
* `src/app/provider/venues/new/actions.ts`: saveIdentity, saveCommercialStep, saveOperations, savePhotos
* `src/app/provider/venues/[id]/actions.ts`: saveVenueInfo, saveCommercial, saveSpace, saveStructure
* `src/app/provider/venues/[id]/spaces/actions.ts`: saveSpaceFields, setSpaceLinks, duplicateSpace, saveSpaceSection
* `src/lib/actions/account.ts`: saveProfile, saveNotifications, changePassword, accountDeletion, calendarFeed, startAddCard, setDefaultCard, removeCard
* `src/lib/actions/agent.ts`: startRun, decideApproval, toggleRoutine, createRoutine
* `src/lib/actions/booking.ts`: saveBookingDraft, submitBooking, acceptQuote, checkAvailability
* `src/lib/actions/build-extra.ts`: reorderBuild, replaceWith, addAndRequest
* `src/lib/actions/build.ts`: addToBuild, removeFromBuild, requestQuote, holdItem, setItemRole, dateChangeImpact, changeEventDate
* `src/lib/actions/builders.ts`: savePage, saveMediaAsset
* `src/lib/actions/calendar.ts`: createCalendarEntry, rescheduleEntry
* `src/lib/actions/checkin.ts`: scanTicket
* `src/lib/actions/create-event.ts`: saveCreateStep, finishCreate
* `src/lib/actions/event-profile.ts`: setEventStatus, updateEventBasics, confirmVenueOffPlatform, savePublicPageSettings, addProgrammeItem, deleteProgrammeItem, setRunSheetStatus, addTask, toggleTask, reportIncident, resolveIncident, transitionItem
* `src/lib/actions/events.ts`: duplicateEvent, archiveEvent, cancelEvent, duplicateMyEvent, importEvents
* `src/lib/actions/files.ts`: registerEventFile
* `src/lib/actions/guests.ts`: addGuest, importGuests, sendInvites, setGuestStatus, removeGuest, createTier
* `src/lib/actions/invoice-wizard.ts`: saveInvoiceDraft, scheduleInvoice
* `src/lib/actions/marketplace.ts`: sendRequest, selectQuote, messageAllProviders
* `src/lib/actions/messages.ts`: sendMessage, markThreadRead
* `src/lib/actions/money.ts`: issueInvoice, remindInvoice, creditInvoice, recordPayment, paymentLink, saveInvoiceNotes
* `src/lib/actions/my-events.ts`: cancellationImpact, cancelMyEvent, archiveMyEvent, upgradeToOrganizer, toggleMyTask
* `src/lib/actions/plan-wizard.ts`: savePlanStep, createFromPlan, discardPlan
* `src/lib/actions/plan.ts`: addCustomerTask, addDayPlanItem
* `src/lib/actions/poster-copy.ts`: suggestPosterCopy
* `src/lib/actions/promotion.ts`: savePromotionPlan, setPromotionStatus, createPromoter, setDistribution
* `src/lib/actions/proposals.ts`: proposalTotals, saveProposalClient, saveProposalPricing, sendProposal, reviseProposal, withdrawProposal, duplicateProposal, convertProposal, toggleProposalOption
* `src/lib/actions/reviews.ts`: submitReview, deleteReview
* `src/lib/actions/sales.ts`: createLead, moveLead, loseLead, scheduleFollowUp, assignLead, addLeadNote, convertLead
* `src/lib/actions/shell.ts`: switchWorkspace, markNotificationsRead
* `src/lib/actions/team.ts`: savePerson, setPersonStatus, assignShift, setShiftStatus, requestAvailability, addNote
* `src/lib/actions/templates.ts`: saveTemplate
* `src/lib/actions/ticket-pro.ts`: saveProModel, saveProTiers, saveAllocation, saveAccess, activateTickets
* `src/lib/actions/ticket-setup.ts`: saveTicketModel, saveSalesRules, publishTickets
* `src/lib/actions/tickets.ts`: transferTicket, resaleTicket, updateAttendee
* `src/lib/actions/workspace-settings.ts`: saveWorkspaceSettings, changeMemberRole
* `src/lib/agent/actions.ts`: startRun, confirmPlan, controlRun, decideApproval, approveBatch, askAgent, saveRoutine, toggleRoutine, savePolicy, createWatch, startBatch
* `src/lib/agent/credits.ts`: saveAiBudget
* `src/lib/developer/actions.ts`: webhookEvents, createApiKey, revokeApiKey, createWebhook, setWebhookStatus, testWebhook, replayDelivery
* `src/lib/live/actions.ts`: setProviderCheckin, setProgrammeStatus, reportIncident, resolveIncident
* `src/lib/marketplace/actions.ts`: requestHold, respondHold, releaseHold, requestStandby, offerStandby, declineStandby, acceptStandby, activateStandby, releaseStandby, quoteCancellation, requestCancellation, decideCancellation, openDispute, addDisputeEntry, acceptDisputeResolution, createEmergencyRequest, respondEmergency, acceptEmergency, cancelEmergency, saveEmergencyProfile, payBooking
* `src/lib/media/actions.ts`: createDesign, saveDesign, restoreVersion, deriveDesign, archiveDesign, publishTemplate, reportTemplate, eventDataFor
* `src/lib/messaging/actions.ts`: startConversation, sendMessage, markRead
* `src/lib/mfa/actions.ts`: generateRecoveryCodes, recordFactorChange, setWorkspaceMfaPolicy
* `src/lib/tickets/actions.ts`: offerTransfer, acceptTransfer, cancelTransfer, joinWaitlist
* `src/lib/tickets/scan.ts`: scanCredential, scanManifest, scanLookup, syncOfflineScans
* `src/lib/venue/actions.ts`: quoteVenue, placeVenueHold, offerAlternative, decideAlternative, saveRateCard, deleteRateCard, saveEventOrder, approveEventOrder, saveMenu, saveMenuSection, saveMenuItem, deleteMenuRow, saveBarPackage, saveCatering, priceCatering
* `src/lib/virtual/actions.ts`: saveVirtual

## Database tables

| Table | RLS | Policies | ≈Rows |
|---|---|---|---|
| `admin_money_requests` | on | 1 | 0 |
| `admin_notes` | on | 1 | 3 |
| `admin_record_notes` | on | 1 | 0 |
| `agent_approvals` | on | 2 | 14 |
| `agent_artifacts` | on | 1 | 0 |
| `agent_policies` | on | 2 | 0 |
| `agent_routines` | on | 1 | 9 |
| `agent_run_steps` | on | 1 | 3 |
| `agent_runs` | on | 2 | 552 |
| `agent_tools` | on | 1 | 27 |
| `agent_waits` | on | 1 | 0 |
| `agent_watches` | on | 1 | 0 |
| `ai_budgets` | on | 1 | 0 |
| `ai_credit_ledger` | on | 1 | 0 |
| `ai_model_prices` | on | 1 | 0 |
| `ai_usage_events` | on | 1 | 0 |
| `analytics_daily` | on | 1 | 3780 |
| `api_keys` | on | 1 | 0 |
| `api_requests` | on | 1 | 0 |
| `audit_events` | on | 2 | 1794 |
| `availability_blocks` | on | 1 | 7 |
| `bar_jurisdiction_rules` | on | 1 | 0 |
| `bar_packages` | on | 2 | 0 |
| `booking_cancellations` | on | 1 | 0 |
| `booking_dispute_entries` | on | 1 | 0 |
| `booking_disputes` | on | 1 | 0 |
| `brand_kits` | on | 2 | 0 |
| `break_glass_access_log` | on | 1 | 0 |
| `break_glass_grants` | on | 1 | 0 |
| `build_items` | on | 3 | 106 |
| `calendar_entries` | on | 1 | 9 |
| `catering_selections` | on | 1 | 0 |
| `check_ins` | on | 2 | 7949 |
| `checkout_orders` | on | 1 | 8 |
| `commission_rules` | on | 1 | 0 |
| `conditional_holds` | on | 1 | 0 |
| `connect_accounts` | on | 1 | 0 |
| `conversation_messages` | on | 1 | 0 |
| `conversation_participants` | on | 1 | 0 |
| `conversations` | on | 1 | 0 |
| `credential_requirements` | on | 1 | 0 |
| `credential_types` | on | 1 | 0 |
| `credit_packs` | on | 1 | 0 |
| `crew_members` | on | 1 | 34 |
| `design_comments` | on | 1 | 0 |
| `design_shares` | on | 1 | 0 |
| `design_templates` | on | 1 | 0 |
| `design_versions` | on | 1 | 0 |
| `designs` | on | 1 | 0 |
| `discount_codes` | on | 1 | 0 |
| `email_outbox` | on | 1 | 20 |
| `emergency_candidates` | on | 1 | 0 |
| `emergency_provider_profiles` | on | 1 | 0 |
| `emergency_requests` | on | 1 | 0 |
| `enquiries` | on | 1 | 0 |
| `event_cancellations` | on | 1 | 0 |
| `event_metrics_daily` | on | 1 | 30 |
| `event_order_versions` | on | 1 | 0 |
| `event_orders` | on | 1 | 0 |
| `event_seats` | on | 2 | 264 |
| `event_templates` | on | 1 | 0 |
| `event_virtual` | on | 1 | 0 |
| `events` | on | 8 | 83 |
| `guests` | on | 1 | 40 |
| `incidents` | on | 1 | 0 |
| `integrations` | on | 1 | 17 |
| `invoice_events` | on | 1 | 4 |
| `invoice_installments` | on | 1 | 0 |
| `invoice_items` | on | 1 | 0 |
| `invoices` | on | 3 | 10 |
| `launch_queue` | on | 0 | 0 |
| `lead_activities` | on | 1 | 6 |
| `leads` | on | 1 | 18 |
| `ledger_entries` | on | 1 | 276 |
| `ledger_transactions` | on | 1 | 119 |
| `listings` | on | 3 | 44 |
| `maintenance_windows` | on | 1 | 0 |
| `media_assets` | on | 1 | 0 |
| `menu_items` | on | 2 | 0 |
| `menu_sections` | on | 2 | 0 |
| `menus` | on | 2 | 0 |
| `messages` | on | 2 | 13 |
| `mfa_recovery_codes` | on | 0 | 0 |
| `notifications` | on | 2 | 130 |
| `packages` | on | 2 | 13 |
| `partner_content` | on | 1 | 0 |
| `partner_earnings` | on | 1 | 181 |
| `partner_referrals` | on | 1 | 144 |
| `partner_statements` | on | 1 | 0 |
| `partners` | on | 1 | 17 |
| `payment_orders` | on | 1 | 9 |
| `payments` | on | 2 | 52 |
| `plan_entitlements` | on | 1 | 64 |
| `platform_admins` | on | 2 | 2 |
| `platform_settings` | on | 1 | 17 |
| `portal_approvals` | on | 3 | 0 |
| `portal_documents` | on | 3 | 0 |
| `portal_links` | on | 1 | 0 |
| `portal_messages` | on | 2 | 0 |
| `privacy_requests` | on | 1 | 0 |
| `profiles` | on | 3 | 90 |
| `programme_items` | on | 2 | 25 |
| `promoter_assets` | on | 2 | 0 |
| `promoter_clicks` | on | 1 | 3402 |
| `promoter_payouts` | on | 1 | 0 |
| `promoter_sales` | on | 1 | 122 |
| `promoters` | on | 2 | 5 |
| `promotions` | on | 1 | 0 |
| `proposal_versions` | on | 1 | 0 |
| `proposals` | on | 3 | 8 |
| `provider_checkins` | on | 1 | 0 |
| `provider_documents` | on | 2 | 0 |
| `provider_jobs` | on | 1 | 27 |
| `provider_quotes` | on | 1 | 9 |
| `provider_requests` | on | 2 | 18 |
| `rate_limits` | on | 0 | 113 |
| `recently_viewed` | on | 1 | 17 |
| `reliability_metrics` | on | 1 | 1 |
| `resale_holds` | on | 0 | 0 |
| `resale_payouts` | on | 1 | 0 |
| `reviews` | on | 3 | 0 |
| `role_permissions` | on | 1 | 70 |
| `saved_items` | on | 1 | 18 |
| `shifts` | on | 1 | 82 |
| `space_links` | on | 1 | 5 |
| `spaces` | on | 2 | 8 |
| `standby_commitments` | on | 1 | 0 |
| `state_machines` | on | 0 | 11 |
| `state_transitions` | on | 0 | 455 |
| `state_violations` | on | 0 | 52 |
| `storage_backups` | on | 0 | 0 |
| `stripe_disputes` | on | 1 | 0 |
| `support_cases` | on | 1 | 145 |
| `support_messages` | on | 1 | 274 |
| `tasks` | on | 1 | 74 |
| `template_creator_restrictions` | on | 1 | 0 |
| `template_reports` | on | 1 | 0 |
| `template_saves` | on | 1 | 0 |
| `threads` | on | 2 | 10 |
| `ticket_holds` | on | 0 | 0 |
| `ticket_tiers` | on | 4 | 42 |
| `ticket_transfers` | on | 1 | 0 |
| `ticket_waitlist` | on | 1 | 0 |
| `tickets` | on | 2 | 17467 |
| `transactions` | on | 2 | 608 |
| `trust_cases` | on | 1 | 88 |
| `uploaded_fonts` | on | 2 | 0 |
| `user_tasks` | on | 1 | 0 |
| `user_tours` | on | 1 | 0 |
| `venue_alternatives` | on | 1 | 0 |
| `venue_maps` | on | 1 | 0 |
| `venue_rate_cards` | on | 2 | 0 |
| `venue_structures` | on | 2 | 1 |
| `verification_records` | on | 1 | 0 |
| `webhook_deliveries` | on | 1 | 0 |
| `webhook_endpoints` | on | 1 | 0 |
| `webhook_events` | on | 0 | 258 |
| `workspace_invites` | on | 3 | 0 |
| `workspace_members` | on | 2 | 66 |
| `workspaces` | on | 4 | 60 |

## Functions callable by clients

| Function | Definer | Roles |
|---|---|---|
| `accept_dispute_resolution` | yes | authenticated,service_role |
| `accept_emergency_candidate` | yes | authenticated,service_role |
| `accept_proposal` | yes | authenticated,anon,service_role |
| `accept_standby` | yes | authenticated,service_role |
| `accept_ticket_transfer` | yes | authenticated,service_role |
| `activate_standby` | yes | authenticated,service_role |
| `add_dispute_entry` | yes | authenticated,service_role |
| `admin_actor_name` | yes | authenticated,service_role |
| `admin_add_note` | yes | authenticated,service_role |
| `admin_add_record_note` | yes | authenticated,service_role |
| `admin_assign_case` | yes | authenticated,service_role |
| `admin_assign_trust` | yes | authenticated,service_role |
| `admin_break_glass_report` | yes | authenticated,service_role |
| `admin_cancel_money_request` | yes | authenticated,service_role |
| `admin_case_conversations` | yes | authenticated,service_role |
| `admin_close_break_glass` | yes | authenticated,service_role |
| `admin_create_support_case` | yes | authenticated,service_role |
| `admin_create_trust_case` | yes | authenticated,service_role |
| `admin_cron_job_status` | yes | authenticated,service_role |
| `admin_decide_agent_approval` | yes | authenticated,service_role |
| `admin_decide_break_glass` | yes | authenticated,service_role |
| `admin_decide_trust` | yes | authenticated,service_role |
| `admin_discard_setting_draft` | yes | authenticated,service_role |
| `admin_dispute_update` | yes | authenticated,service_role |
| `admin_event_metrics` | yes | authenticated,service_role |
| `admin_grant_conversations` | yes | authenticated,service_role |
| `admin_grant_credits` | yes | authenticated,service_role |
| `admin_listing_metrics` | yes | authenticated,service_role |
| `admin_open_conversation` | yes | authenticated,service_role |
| `admin_overview` | yes | authenticated,service_role |
| `admin_publish_setting` | yes | authenticated,service_role |
| `admin_publish_setting_draft` | yes | authenticated,service_role |
| `admin_reply_case` | yes | authenticated,service_role |
| `admin_request_break_glass` | yes | authenticated,service_role |
| `admin_request_money` | yes | authenticated,service_role |
| `admin_request_trust_evidence` | yes | authenticated,service_role |
| `admin_require` | yes | authenticated,service_role |
| `admin_review_listing` | yes | authenticated,service_role |
| `admin_revoke_sessions` | yes | authenticated,service_role |
| `admin_rollback_setting` | yes | authenticated,service_role |
| `admin_save_setting_draft` | yes | authenticated,service_role |
| `admin_set_event_featured` | yes | authenticated,service_role |
| `admin_set_event_restriction` | yes | authenticated,service_role |
| `admin_set_integration` | yes | authenticated,service_role |
| `admin_set_partner_status` | yes | authenticated,service_role |
| `admin_set_partner_terms` | yes | authenticated,service_role |
| `admin_set_ticket_sales` | yes | authenticated,service_role |
| `admin_set_user_status` | yes | authenticated,service_role |
| `admin_set_workspace_commission` | yes | authenticated,service_role |
| `admin_set_workspace_plan` | yes | authenticated,service_role |
| `admin_set_workspace_status` | yes | authenticated,service_role |
| `admin_ticket_counts` |  | authenticated,anon,service_role |
| `admin_ticket_daily` | yes | authenticated,service_role |
| `admin_touch_conversation` | yes | authenticated,service_role |
| `admin_update_case` | yes | authenticated,service_role |
| `admin_user_directory` | yes | authenticated,service_role |
| `admin_user_identity` | yes | authenticated,service_role |
| `admin_user_stats` | yes | authenticated,service_role |
| `admin_workspace_daily` | yes | authenticated,service_role |
| `admin_workspace_metrics` | yes | authenticated,service_role |
| `agent_action_allowed` |  | authenticated,anon,service_role |
| `agent_control_run` | yes | authenticated,service_role |
| `agent_propose_action` | yes | authenticated,service_role |
| `agent_record_result` | yes | authenticated,service_role |
| `ai_credit_status` | yes | authenticated,service_role |
| `approve_event_order` | yes | authenticated,service_role |
| `assert_writable` | yes | authenticated,service_role |
| `bg_expire` | yes | authenticated,service_role |
| `bg_step_up_ok` |  | authenticated,service_role |
| `can_access_conversation` | yes | authenticated,service_role |
| `can_access_emergency_request` | yes | authenticated,service_role |
| `can_access_event` | yes | authenticated,service_role |
| `can_edit_event` | yes | authenticated,service_role |
| `can_manage_promoter` | yes | authenticated,service_role |
| `can_read_media_path` | yes | authenticated,service_role |
| `can_see_agent_run` | yes | authenticated,anon,service_role |
| `can_see_event_money` | yes | authenticated,service_role |
| `can_write_listing_media` | yes | authenticated,service_role |
| `cancel_agent_watch` | yes | authenticated,service_role |
| `cancel_emergency_request` | yes | authenticated,service_role |
| `cancel_event_with_refunds` | yes | authenticated,service_role |
| `cancel_ticket_transfer` | yes | authenticated,service_role |
| `cancellation_quote` | yes | authenticated,service_role |
| `cash_dist` |  | authenticated,anon,service_role |
| `catering_price` | yes | authenticated,service_role |
| `check_in_ticket` | yes | authenticated,service_role |
| `checkout_holds` | yes | authenticated,anon,service_role |
| `claim_waitlist_offer` | yes | authenticated,service_role |
| `complete_customer_onboarding` | yes | authenticated,service_role |
| `complete_workspace_onboarding` | yes | authenticated,service_role |
| `create_agent_watch` | yes | authenticated,service_role |
| `create_api_key` | yes | authenticated,service_role |
| `create_demo_workspace` | yes | authenticated,service_role |
| `create_design` | yes | authenticated,service_role |
| `create_emergency_request` | yes | authenticated,service_role |
| `create_job_for_confirmed_item` | yes | authenticated,service_role |
| `create_payment_order` | yes | authenticated,service_role |
| `create_webhook_endpoint` | yes | authenticated,service_role |
| `credit_invoice` | yes | authenticated,service_role |
| `cube` |  | authenticated,anon,service_role |
| `cube` |  | authenticated,anon,service_role |
| `cube` |  | authenticated,anon,service_role |
| `cube` |  | authenticated,anon,service_role |
| `cube` |  | authenticated,anon,service_role |
| `cube` |  | authenticated,anon,service_role |
| `cube_cmp` |  | authenticated,anon,service_role |
| `cube_contained` |  | authenticated,anon,service_role |
| `cube_contains` |  | authenticated,anon,service_role |
| `cube_coord` |  | authenticated,anon,service_role |
| `cube_coord_llur` |  | authenticated,anon,service_role |
| `cube_dim` |  | authenticated,anon,service_role |
| `cube_distance` |  | authenticated,anon,service_role |
| `cube_enlarge` |  | authenticated,anon,service_role |
| `cube_eq` |  | authenticated,anon,service_role |
| `cube_ge` |  | authenticated,anon,service_role |
| `cube_gt` |  | authenticated,anon,service_role |
| `cube_in` |  | authenticated,anon,service_role |
| `cube_inter` |  | authenticated,anon,service_role |
| `cube_is_point` |  | authenticated,anon,service_role |
| `cube_le` |  | authenticated,anon,service_role |
| `cube_ll_coord` |  | authenticated,anon,service_role |
| `cube_lt` |  | authenticated,anon,service_role |
| `cube_ne` |  | authenticated,anon,service_role |
| `cube_out` |  | authenticated,anon,service_role |
| `cube_overlap` |  | authenticated,anon,service_role |
| `cube_recv` |  | authenticated,anon,service_role |
| `cube_send` |  | authenticated,anon,service_role |
| `cube_size` |  | authenticated,anon,service_role |
| `cube_subset` |  | authenticated,anon,service_role |
| `cube_union` |  | authenticated,anon,service_role |
| `cube_ur_coord` |  | authenticated,anon,service_role |
| `customer_accept_quote` | yes | authenticated,service_role |
| `customer_save_booking` | yes | authenticated,service_role |
| `date_dist` |  | authenticated,anon,service_role |
| `decide_agent_approval` | yes | authenticated,service_role |
| `decide_cancellation` | yes | authenticated,service_role |
| `decide_venue_alternative` | yes | authenticated,service_role |
| `delete_demo_workspace` | yes | authenticated,service_role |
| `delete_my_review` | yes | authenticated,service_role |
| `deletion_blockers` | yes | authenticated,service_role |
| `design_access` | yes | authenticated,service_role |
| `distance_chebyshev` |  | authenticated,anon,service_role |
| `distance_taxicab` |  | authenticated,anon,service_role |
| `earth` |  | authenticated,anon,service_role |
| `earth_box` |  | authenticated,anon,service_role |
| `earth_distance` |  | authenticated,anon,service_role |
| `email_category` |  | authenticated,anon,service_role |
| `end_maintenance` | yes | authenticated,service_role |
| `enforce_space_rules` |  | authenticated,anon,service_role |
| `enforce_state_transition` | yes | authenticated,anon,service_role |
| `ensure_invoice_token` | yes | authenticated,service_role |
| `entitlement` | yes | authenticated,service_role |
| `event_activity` | yes | authenticated,service_role |
| `event_build_budget` | yes | authenticated,service_role |
| `event_feasibility` | yes | authenticated,service_role |
| `event_launch_state` | yes | authenticated,anon,service_role |
| `event_order_versions_immutable` |  | authenticated,anon,service_role |
| `event_readiness` | yes | authenticated,service_role |
| `event_virtual_public` | yes | authenticated,anon,service_role |
| `float4_dist` |  | authenticated,anon,service_role |
| `float8_dist` |  | authenticated,anon,service_role |
| `g_cube_consistent` |  | authenticated,anon,service_role |
| `g_cube_distance` |  | authenticated,anon,service_role |
| `g_cube_penalty` |  | authenticated,anon,service_role |
| `g_cube_picksplit` |  | authenticated,anon,service_role |
| `g_cube_same` |  | authenticated,anon,service_role |
| `g_cube_union` |  | authenticated,anon,service_role |
| `gbt_bit_compress` |  | authenticated,anon,service_role |
| `gbt_bit_consistent` |  | authenticated,anon,service_role |
| `gbt_bit_penalty` |  | authenticated,anon,service_role |
| `gbt_bit_picksplit` |  | authenticated,anon,service_role |
| `gbt_bit_same` |  | authenticated,anon,service_role |
| `gbt_bit_union` |  | authenticated,anon,service_role |
| `gbt_bool_compress` |  | authenticated,anon,service_role |
| `gbt_bool_consistent` |  | authenticated,anon,service_role |
| `gbt_bool_fetch` |  | authenticated,anon,service_role |
| `gbt_bool_penalty` |  | authenticated,anon,service_role |
| `gbt_bool_picksplit` |  | authenticated,anon,service_role |
| `gbt_bool_same` |  | authenticated,anon,service_role |
| `gbt_bool_union` |  | authenticated,anon,service_role |
| `gbt_bpchar_compress` |  | authenticated,anon,service_role |
| `gbt_bpchar_consistent` |  | authenticated,anon,service_role |
| `gbt_bytea_compress` |  | authenticated,anon,service_role |
| `gbt_bytea_consistent` |  | authenticated,anon,service_role |
| `gbt_bytea_penalty` |  | authenticated,anon,service_role |
| `gbt_bytea_picksplit` |  | authenticated,anon,service_role |
| `gbt_bytea_same` |  | authenticated,anon,service_role |
| `gbt_bytea_union` |  | authenticated,anon,service_role |
| `gbt_cash_compress` |  | authenticated,anon,service_role |
| `gbt_cash_consistent` |  | authenticated,anon,service_role |
| `gbt_cash_distance` |  | authenticated,anon,service_role |
| `gbt_cash_fetch` |  | authenticated,anon,service_role |
| `gbt_cash_penalty` |  | authenticated,anon,service_role |
| `gbt_cash_picksplit` |  | authenticated,anon,service_role |
| `gbt_cash_same` |  | authenticated,anon,service_role |
| `gbt_cash_union` |  | authenticated,anon,service_role |
| `gbt_date_compress` |  | authenticated,anon,service_role |
| `gbt_date_consistent` |  | authenticated,anon,service_role |
| `gbt_date_distance` |  | authenticated,anon,service_role |
| `gbt_date_fetch` |  | authenticated,anon,service_role |
| `gbt_date_penalty` |  | authenticated,anon,service_role |
| `gbt_date_picksplit` |  | authenticated,anon,service_role |
| `gbt_date_same` |  | authenticated,anon,service_role |
| `gbt_date_union` |  | authenticated,anon,service_role |
| `gbt_decompress` |  | authenticated,anon,service_role |
| `gbt_enum_compress` |  | authenticated,anon,service_role |
| `gbt_enum_consistent` |  | authenticated,anon,service_role |
| `gbt_enum_fetch` |  | authenticated,anon,service_role |
| `gbt_enum_penalty` |  | authenticated,anon,service_role |
| `gbt_enum_picksplit` |  | authenticated,anon,service_role |
| `gbt_enum_same` |  | authenticated,anon,service_role |
| `gbt_enum_union` |  | authenticated,anon,service_role |
| `gbt_float4_compress` |  | authenticated,anon,service_role |
| `gbt_float4_consistent` |  | authenticated,anon,service_role |
| `gbt_float4_distance` |  | authenticated,anon,service_role |
| `gbt_float4_fetch` |  | authenticated,anon,service_role |
| `gbt_float4_penalty` |  | authenticated,anon,service_role |
| `gbt_float4_picksplit` |  | authenticated,anon,service_role |
| `gbt_float4_same` |  | authenticated,anon,service_role |
| `gbt_float4_union` |  | authenticated,anon,service_role |
| `gbt_float8_compress` |  | authenticated,anon,service_role |
| `gbt_float8_consistent` |  | authenticated,anon,service_role |
| `gbt_float8_distance` |  | authenticated,anon,service_role |
| `gbt_float8_fetch` |  | authenticated,anon,service_role |
| `gbt_float8_penalty` |  | authenticated,anon,service_role |
| `gbt_float8_picksplit` |  | authenticated,anon,service_role |
| `gbt_float8_same` |  | authenticated,anon,service_role |
| `gbt_float8_union` |  | authenticated,anon,service_role |
| `gbt_inet_compress` |  | authenticated,anon,service_role |
| `gbt_inet_consistent` |  | authenticated,anon,service_role |
| `gbt_inet_penalty` |  | authenticated,anon,service_role |
| `gbt_inet_picksplit` |  | authenticated,anon,service_role |
| `gbt_inet_same` |  | authenticated,anon,service_role |
| `gbt_inet_union` |  | authenticated,anon,service_role |
| `gbt_int2_compress` |  | authenticated,anon,service_role |
| `gbt_int2_consistent` |  | authenticated,anon,service_role |
| `gbt_int2_distance` |  | authenticated,anon,service_role |
| `gbt_int2_fetch` |  | authenticated,anon,service_role |
| `gbt_int2_penalty` |  | authenticated,anon,service_role |
| `gbt_int2_picksplit` |  | authenticated,anon,service_role |
| `gbt_int2_same` |  | authenticated,anon,service_role |
| `gbt_int2_union` |  | authenticated,anon,service_role |
| `gbt_int4_compress` |  | authenticated,anon,service_role |
| `gbt_int4_consistent` |  | authenticated,anon,service_role |
| `gbt_int4_distance` |  | authenticated,anon,service_role |
| `gbt_int4_fetch` |  | authenticated,anon,service_role |
| `gbt_int4_penalty` |  | authenticated,anon,service_role |
| `gbt_int4_picksplit` |  | authenticated,anon,service_role |
| `gbt_int4_same` |  | authenticated,anon,service_role |
| `gbt_int4_union` |  | authenticated,anon,service_role |
| `gbt_int8_compress` |  | authenticated,anon,service_role |
| `gbt_int8_consistent` |  | authenticated,anon,service_role |
| `gbt_int8_distance` |  | authenticated,anon,service_role |
| `gbt_int8_fetch` |  | authenticated,anon,service_role |
| `gbt_int8_penalty` |  | authenticated,anon,service_role |
| `gbt_int8_picksplit` |  | authenticated,anon,service_role |
| `gbt_int8_same` |  | authenticated,anon,service_role |
| `gbt_int8_union` |  | authenticated,anon,service_role |
| `gbt_intv_compress` |  | authenticated,anon,service_role |
| `gbt_intv_consistent` |  | authenticated,anon,service_role |
| `gbt_intv_decompress` |  | authenticated,anon,service_role |
| `gbt_intv_distance` |  | authenticated,anon,service_role |
| `gbt_intv_fetch` |  | authenticated,anon,service_role |
| `gbt_intv_penalty` |  | authenticated,anon,service_role |
| `gbt_intv_picksplit` |  | authenticated,anon,service_role |
| `gbt_intv_same` |  | authenticated,anon,service_role |
| `gbt_intv_union` |  | authenticated,anon,service_role |
| `gbt_macad8_compress` |  | authenticated,anon,service_role |
| `gbt_macad8_consistent` |  | authenticated,anon,service_role |
| `gbt_macad8_fetch` |  | authenticated,anon,service_role |
| `gbt_macad8_penalty` |  | authenticated,anon,service_role |
| `gbt_macad8_picksplit` |  | authenticated,anon,service_role |
| `gbt_macad8_same` |  | authenticated,anon,service_role |
| `gbt_macad8_union` |  | authenticated,anon,service_role |
| `gbt_macad_compress` |  | authenticated,anon,service_role |
| `gbt_macad_consistent` |  | authenticated,anon,service_role |
| `gbt_macad_fetch` |  | authenticated,anon,service_role |
| `gbt_macad_penalty` |  | authenticated,anon,service_role |
| `gbt_macad_picksplit` |  | authenticated,anon,service_role |
| `gbt_macad_same` |  | authenticated,anon,service_role |
| `gbt_macad_union` |  | authenticated,anon,service_role |
| `gbt_numeric_compress` |  | authenticated,anon,service_role |
| `gbt_numeric_consistent` |  | authenticated,anon,service_role |
| `gbt_numeric_penalty` |  | authenticated,anon,service_role |
| `gbt_numeric_picksplit` |  | authenticated,anon,service_role |
| `gbt_numeric_same` |  | authenticated,anon,service_role |
| `gbt_numeric_union` |  | authenticated,anon,service_role |
| `gbt_oid_compress` |  | authenticated,anon,service_role |
| `gbt_oid_consistent` |  | authenticated,anon,service_role |
| `gbt_oid_distance` |  | authenticated,anon,service_role |
| `gbt_oid_fetch` |  | authenticated,anon,service_role |
| `gbt_oid_penalty` |  | authenticated,anon,service_role |
| `gbt_oid_picksplit` |  | authenticated,anon,service_role |
| `gbt_oid_same` |  | authenticated,anon,service_role |
| `gbt_oid_union` |  | authenticated,anon,service_role |
| `gbt_text_compress` |  | authenticated,anon,service_role |
| `gbt_text_consistent` |  | authenticated,anon,service_role |
| `gbt_text_penalty` |  | authenticated,anon,service_role |
| `gbt_text_picksplit` |  | authenticated,anon,service_role |
| `gbt_text_same` |  | authenticated,anon,service_role |
| `gbt_text_union` |  | authenticated,anon,service_role |
| `gbt_time_compress` |  | authenticated,anon,service_role |
| `gbt_time_consistent` |  | authenticated,anon,service_role |
| `gbt_time_distance` |  | authenticated,anon,service_role |
| `gbt_time_fetch` |  | authenticated,anon,service_role |
| `gbt_time_penalty` |  | authenticated,anon,service_role |
| `gbt_time_picksplit` |  | authenticated,anon,service_role |
| `gbt_time_same` |  | authenticated,anon,service_role |
| `gbt_time_union` |  | authenticated,anon,service_role |
| `gbt_timetz_compress` |  | authenticated,anon,service_role |
| `gbt_timetz_consistent` |  | authenticated,anon,service_role |
| `gbt_ts_compress` |  | authenticated,anon,service_role |
| `gbt_ts_consistent` |  | authenticated,anon,service_role |
| `gbt_ts_distance` |  | authenticated,anon,service_role |
| `gbt_ts_fetch` |  | authenticated,anon,service_role |
| `gbt_ts_penalty` |  | authenticated,anon,service_role |
| `gbt_ts_picksplit` |  | authenticated,anon,service_role |
| `gbt_ts_same` |  | authenticated,anon,service_role |
| `gbt_ts_union` |  | authenticated,anon,service_role |
| `gbt_tstz_compress` |  | authenticated,anon,service_role |
| `gbt_tstz_consistent` |  | authenticated,anon,service_role |
| `gbt_tstz_distance` |  | authenticated,anon,service_role |
| `gbt_uuid_compress` |  | authenticated,anon,service_role |
| `gbt_uuid_consistent` |  | authenticated,anon,service_role |
| `gbt_uuid_fetch` |  | authenticated,anon,service_role |
| `gbt_uuid_penalty` |  | authenticated,anon,service_role |
| `gbt_uuid_picksplit` |  | authenticated,anon,service_role |
| `gbt_uuid_same` |  | authenticated,anon,service_role |
| `gbt_uuid_union` |  | authenticated,anon,service_role |
| `gbt_var_decompress` |  | authenticated,anon,service_role |
| `gbt_var_fetch` |  | authenticated,anon,service_role |
| `gbtreekey16_in` |  | authenticated,anon,service_role |
| `gbtreekey16_out` |  | authenticated,anon,service_role |
| `gbtreekey2_in` |  | authenticated,anon,service_role |
| `gbtreekey2_out` |  | authenticated,anon,service_role |
| `gbtreekey32_in` |  | authenticated,anon,service_role |
| `gbtreekey32_out` |  | authenticated,anon,service_role |
| `gbtreekey4_in` |  | authenticated,anon,service_role |
| `gbtreekey4_out` |  | authenticated,anon,service_role |
| `gbtreekey8_in` |  | authenticated,anon,service_role |
| `gbtreekey8_out` |  | authenticated,anon,service_role |
| `gbtreekey_var_in` |  | authenticated,anon,service_role |
| `gbtreekey_var_out` |  | authenticated,anon,service_role |
| `gc_to_sec` |  | authenticated,anon,service_role |
| `geo_distance` |  | authenticated,anon,service_role |
| `gin_extract_query_trgm` |  | authenticated,anon,service_role |
| `gin_extract_value_trgm` |  | authenticated,anon,service_role |
| `gin_trgm_consistent` |  | authenticated,anon,service_role |
| `gin_trgm_triconsistent` |  | authenticated,anon,service_role |
| `global_search` | yes | authenticated,service_role |
| `gtrgm_compress` |  | authenticated,anon,service_role |
| `gtrgm_consistent` |  | authenticated,anon,service_role |
| `gtrgm_decompress` |  | authenticated,anon,service_role |
| `gtrgm_distance` |  | authenticated,anon,service_role |
| `gtrgm_in` |  | authenticated,anon,service_role |
| `gtrgm_options` |  | authenticated,anon,service_role |
| `gtrgm_out` |  | authenticated,anon,service_role |
| `gtrgm_penalty` |  | authenticated,anon,service_role |
| `gtrgm_picksplit` |  | authenticated,anon,service_role |
| `gtrgm_same` |  | authenticated,anon,service_role |
| `gtrgm_union` |  | authenticated,anon,service_role |
| `has_admin_permission` | yes | authenticated,service_role |
| `has_capability` | yes | authenticated,service_role |
| `has_permission` | yes | authenticated,service_role |
| `has_workspace_role` | yes | authenticated,service_role |
| `hold_resale` | yes | authenticated,service_role |
| `hold_seats` | yes | authenticated,anon,service_role |
| `hold_tickets` | yes | authenticated,anon,service_role |
| `holds_ticket_for` | yes | authenticated,service_role |
| `int2_dist` |  | authenticated,anon,service_role |
| `int4_dist` |  | authenticated,anon,service_role |
| `int8_dist` |  | authenticated,anon,service_role |
| `interval_dist` |  | authenticated,anon,service_role |
| `invite_preview` | yes | authenticated,anon,service_role |
| `invoice_by_token` | yes | authenticated,service_role |
| `invoice_reminder` | yes | authenticated,service_role |
| `is_emergency_candidate` | yes | authenticated,service_role |
| `is_event_promoter` | yes | authenticated,service_role |
| `is_listing_provider` | yes | authenticated,service_role |
| `is_platform_admin` | yes | authenticated,service_role |
| `is_provider_for_event` | yes | authenticated,service_role |
| `is_workspace_member` | yes | authenticated,anon,service_role |
| `is_workspace_owner` | yes | authenticated,service_role |
| `issue_invoice` | yes | authenticated,service_role |
| `issue_proposal` | yes | authenticated,service_role |
| `join_waitlist` | yes | authenticated,service_role |
| `latitude` |  | authenticated,anon,service_role |
| `ledger_immutable` |  | authenticated,anon,service_role |
| `list_ticket_for_resale` | yes | authenticated,service_role |
| `listing_availability` | yes | authenticated,service_role |
| `listing_readiness` | yes | authenticated,service_role |
| `ll_to_earth` |  | authenticated,anon,service_role |
| `log_auth_event` | yes | authenticated,service_role |
| `longitude` |  | authenticated,anon,service_role |
| `maintenance_level` | yes | authenticated,anon,service_role |
| `maintenance_state` | yes | authenticated,anon,service_role |
| `mark_conversation_read` | yes | authenticated,service_role |
| `mark_proposal_converted` | yes | authenticated,service_role |
| `mark_proposal_viewed` | yes | authenticated,anon,service_role |
| `may_contact` | yes | authenticated,service_role |
| `mfa_required` |  | authenticated,anon,service_role |
| `moderate_review` | yes | authenticated,service_role |
| `moderate_template` | yes | authenticated,service_role |
| `my_contacts` | yes | authenticated,service_role |
| `my_conversations` | yes | authenticated,service_role |
| `my_pending_invites` | yes | authenticated,service_role |
| `my_recovery_code_count` | yes | authenticated,service_role |
| `my_sessions` | yes | authenticated,service_role |
| `my_workspace_access` | yes | authenticated,service_role |
| `offer_ticket_transfer` | yes | authenticated,service_role |
| `oid_dist` |  | authenticated,anon,service_role |
| `open_booking_dispute` | yes | authenticated,service_role |
| `organizer_save_event_plan` | yes | authenticated,service_role |
| `owns_partner` | yes | authenticated,service_role |
| `owns_promoter` | yes | authenticated,service_role |
| `partner_contact_support` | yes | authenticated,service_role |
| `payout_eligible` | yes | authenticated,anon,service_role |
| `plan_catalog` | yes | authenticated,service_role |
| `platform_settings_release` | yes | authenticated,service_role |
| `portal_comment` | yes | authenticated,anon,service_role |
| `portal_decide` | yes | authenticated,anon,service_role |
| `portal_document` | yes | authenticated,anon,service_role |
| `portal_issue_link` | yes | authenticated,service_role |
| `portal_revoke_link` | yes | authenticated,service_role |
| `portal_view` | yes | authenticated,anon,service_role |
| `post_message` | yes | authenticated,service_role |
| `promoter_click_stats` |  | authenticated,service_role |
| `promoter_leaderboard` | yes | authenticated,service_role |
| `promoter_set_payout_method` | yes | authenticated,service_role |
| `promoter_track_click` | yes | authenticated,anon,service_role |
| `proposal_by_token` | yes | authenticated,anon,service_role |
| `protect_job_snapshot` |  | authenticated,service_role |
| `provider_assign_crew` | yes | authenticated,service_role |
| `provider_create_booking` | yes | authenticated,service_role |
| `provider_decline_standby` | yes | authenticated,service_role |
| `provider_emergency_respond` | yes | authenticated,service_role |
| `provider_issue_quote` | yes | authenticated,service_role |
| `provider_job_transition` | yes | authenticated,service_role |
| `provider_mark_thread_read` | yes | authenticated,service_role |
| `provider_offer_standby` | yes | authenticated,service_role |
| `provider_pause_listing` | yes | authenticated,service_role |
| `provider_release_hold` | yes | authenticated,service_role |
| `provider_request_availability` | yes | authenticated,service_role |
| `provider_respond` | yes | authenticated,service_role |
| `provider_respond_hold` | yes | authenticated,service_role |
| `provider_save_crew` | yes | authenticated,service_role |
| `provider_save_listing` | yes | authenticated,service_role |
| `provider_save_package` | yes | authenticated,service_role |
| `provider_save_quote_draft` | yes | authenticated,service_role |
| `provider_save_settings` | yes | authenticated,service_role |
| `provider_save_space` | yes | authenticated,service_role |
| `provider_save_structure` | yes | authenticated,service_role |
| `provider_send_message` | yes | authenticated,service_role |
| `provider_send_quote` | yes | authenticated,service_role |
| `provider_set_availability` | yes | authenticated,service_role |
| `provider_set_crew_status` | yes | authenticated,service_role |
| `provider_set_space_links` | yes | authenticated,service_role |
| `provider_toggle_routine` | yes | authenticated,service_role |
| `provider_withdraw_quote` | yes | authenticated,service_role |
| `public_event_plan` | yes | authenticated,anon,service_role |
| `public_organizer` | yes | authenticated,anon,service_role |
| `public_workspace` | yes | authenticated,anon,service_role |
| `publish_listing` | yes | authenticated,service_role |
| `publish_template` | yes | authenticated,service_role |
| `queue_admit_check` | yes | authenticated,service_role |
| `queue_join` | yes | authenticated,anon,service_role |
| `queue_status` | yes | authenticated,anon,service_role |
| `quote_totals` |  | authenticated,service_role |
| `record_invoice_payment` | yes | authenticated,service_role |
| `release_checkout` | yes | authenticated,anon,service_role |
| `release_conditional_hold` | yes | authenticated,service_role |
| `release_resale_holds` | yes | authenticated,anon,service_role |
| `release_seat_holds` | yes | authenticated,anon,service_role |
| `release_standby` | yes | authenticated,service_role |
| `reliability_band` | yes | authenticated,anon,service_role |
| `remember_workspace` | yes | authenticated,service_role |
| `replay_webhook_delivery` | yes | authenticated,service_role |
| `report_template` | yes | authenticated,service_role |
| `request_account_deletion` | yes | authenticated,service_role |
| `request_cancellation` | yes | authenticated,service_role |
| `request_conditional_hold` | yes | authenticated,service_role |
| `request_standby` | yes | authenticated,service_role |
| `require_provider_role` | yes | authenticated,service_role |
| `resale_holds_for` | yes | authenticated,anon,service_role |
| `resale_listings` | yes | authenticated,anon,service_role |
| `reset_demo_workspace` | yes | authenticated,service_role |
| `respond_to_invite` | yes | authenticated,service_role |
| `respond_to_review` | yes | authenticated,service_role |
| `restore_design_version` | yes | authenticated,service_role |
| `review_provider_document` | yes | authenticated,service_role |
| `revise_proposal` | yes | authenticated,service_role |
| `revoke_api_key` | yes | authenticated,service_role |
| `revoke_other_sessions` | yes | authenticated,service_role |
| `rls_auto_enable` | yes | authenticated,anon,service_role |
| `rotate_calendar_token` | yes | authenticated,service_role |
| `save_catering_selection` | yes | authenticated,service_role |
| `save_design` | yes | authenticated,service_role |
| `save_emergency_profile` | yes | authenticated,service_role |
| `save_event_order` | yes | authenticated,service_role |
| `save_event_virtual` | yes | authenticated,service_role |
| `scan_lookup` | yes | authenticated,service_role |
| `scan_manifest` | yes | authenticated,service_role |
| `scan_ticket` | yes | authenticated,service_role |
| `sec_to_gc` |  | authenticated,anon,service_role |
| `set_ai_budget` | yes | authenticated,service_role |
| `set_limit` |  | authenticated,anon,service_role |
| `set_member_role` | yes | authenticated,service_role |
| `set_my_avatar` | yes | authenticated,service_role |
| `set_provider_checkin` | yes | authenticated,service_role |
| `set_webhook_endpoint_status` | yes | authenticated,service_role |
| `set_workspace_mfa_policy` | yes | authenticated,service_role |
| `show_limit` |  | authenticated,anon,service_role |
| `show_trgm` |  | authenticated,anon,service_role |
| `similarity` |  | authenticated,anon,service_role |
| `similarity_dist` |  | authenticated,anon,service_role |
| `similarity_op` |  | authenticated,anon,service_role |
| `space_conflicts` | yes | authenticated,service_role |
| `start_agent_run` | yes | authenticated,service_role |
| `start_conversation` | yes | authenticated,service_role |
| `start_maintenance` | yes | authenticated,service_role |
| `strict_word_similarity` |  | authenticated,anon,service_role |
| `strict_word_similarity_commutator_op` |  | authenticated,anon,service_role |
| `strict_word_similarity_dist_commutator_op` |  | authenticated,anon,service_role |
| `strict_word_similarity_dist_op` |  | authenticated,anon,service_role |
| `strict_word_similarity_op` |  | authenticated,anon,service_role |
| `submit_privacy_request` | yes | authenticated,service_role |
| `submit_review` | yes | authenticated,service_role |
| `team_conflicts` | yes | authenticated,service_role |
| `template_by_link` | yes | authenticated,service_role |
| `template_usable` | yes | authenticated,service_role |
| `test_webhook_endpoint` | yes | authenticated,service_role |
| `ticket_fee_config` | yes | authenticated,anon,service_role |
| `ticket_sales_series` | yes | authenticated,service_role |
| `time_dist` |  | authenticated,anon,service_role |
| `transfer_ticket` | yes | authenticated,service_role |
| `transition_build_item` | yes | authenticated,service_role |
| `trg_audit_routines` | yes | authenticated,anon,service_role |
| `trg_audit_webhooks` | yes | authenticated,anon,service_role |
| `trg_event_cancel_guard` | yes | authenticated,anon,service_role |
| `trg_maintenance_payment_orders` | yes | authenticated,anon,service_role |
| `trg_notification_email` | yes | authenticated,anon,service_role |
| `trg_session_new_device` | yes | authenticated,anon,service_role |
| `trust_cases_touch` |  | authenticated,service_role |
| `ts_dist` |  | authenticated,anon,service_role |
| `tstz_dist` |  | authenticated,anon,service_role |
| `update_my_profile` | yes | authenticated,service_role |
| `update_privacy_request` | yes | authenticated,service_role |
| `update_ticket_attendee` | yes | authenticated,service_role |
| `update_workspace_settings` | yes | authenticated,service_role |
| `upgrade_event_to_professional` | yes | authenticated,service_role |
| `venue_offer_alternative` | yes | authenticated,service_role |
| `venue_place_hold` | yes | authenticated,service_role |
| `venue_quote` | yes | authenticated,service_role |
| `virtual_join` | yes | authenticated,service_role |
| `waitlist_offer_for` | yes | authenticated,service_role |
| `webhook_event_type` |  | authenticated,anon,service_role |
| `withdraw_proposal` | yes | authenticated,service_role |
| `word_similarity` |  | authenticated,anon,service_role |
| `word_similarity_commutator_op` |  | authenticated,anon,service_role |
| `word_similarity_dist_commutator_op` |  | authenticated,anon,service_role |
| `word_similarity_dist_op` |  | authenticated,anon,service_role |
| `word_similarity_op` |  | authenticated,anon,service_role |
| `workspace_credential_status` | yes | authenticated,service_role |

## Scheduled jobs

| Job | Schedule | Active |
|---|---|---|
| agent-retention | `15 4 2 * *` | true |
| agent-worker | `* * * * *` | true |
| break-glass-expire | `*/15 * * * *` | true |
| break-glass-retention | `30 3 1 * *` | true |
| email-outbox | `*/2 * * * *` | true |
| marketplace-sweep | `*/5 * * * *` | true |
| payments-worker | `*/5 * * * *` | true |
| privacy-deletions | `17 2 * * *` | true |
| retention-security-logs | `45 3 2 * *` | true |
| storage-backup | `*/15 * * * *` | true |
| waitlist-notify | `*/5 * * * *` | true |
| webhook-deliveries | `* * * * *` | true |

## Storage buckets

* `avatars`: public
* `event-media`: public
* `listing-media`: public
* `workspace-files`: private

## Agent tools

| Tool | Risk | Surface | Permission |
|---|---|---|---|
| `calendar.conflicts` | R0 | provider | opportunities.read |
| `event.budget` | R0 | organizer | events.read |
| `event.feasibility` | R0 | organizer | events.read |
| `event.readiness` | R0 | organizer | events.read |
| `events.list` | R0 | organizer | events.read |
| `marketplace.open_requests` | R0 | organizer | events.read |
| `marketplace.search` | R0 | organizer | marketplace.request |
| `media.list_designs` | R0 | both | events.read |
| `money.payables` | R0 | organizer | finance.read |
| `money.provider_summary` | R0 | provider | money.read |
| `opportunities.list` | R0 | provider | opportunities.read |
| `reliability.get` | R0 | provider | opportunities.read |
| `team.conflicts` | R0 | organizer | events.read |
| `tickets.sales` | R0 | organizer | events.read |
| `draft.note` | R1 | both | events.read |
| `media.event_poster` | R1 | organizer | events.write |
| `task.create` | R2 | organizer | events.write |
| `emergency.create` | R3 | organizer | marketplace.request |
| `marketplace.request_hold` | R3 | organizer | marketplace.request |
| `marketplace.request_standby` | R3 | organizer | marketplace.request |
| `message.party` | R3 | both | events.read |
| `opportunity.respond` | R3 | provider | opportunities.respond |
| `venue.hold` | R3 | provider | availability.manage |
| `cancellation.request` | R4 | organizer | marketplace.request |
| `quote.send` | R4 | provider | quotes.send |
| `standby.activate` | R4 | organizer | marketplace.request |
| `tickets.publish_tier` | R4 | organizer | tickets.manage |

## Triggers

* `agent_approvals`: agent_approvals_state_guard
* `agent_runs`: agent_runs_state_guard
* `audit_events`: gd_audit_routines, gd_audit_webhooks
* `booking_cancellations`: booking_cancellations_refund_queue, booking_cancellations_state_guard
* `booking_disputes`: booking_disputes_state_guard
* `build_items`: build_items_create_job, build_items_hold_sync, build_items_primary_failed, build_items_response_track, build_items_state_guard
* `conditional_holds`: conditional_holds_dependency_notify, conditional_holds_state_guard
* `emergency_requests`: emergency_requests_state_guard
* `event_order_versions`: event_order_versions_guard
* `event_orders`: event_orders_state_guard
* `events`: gd_event_cancel_guard
* `ledger_entries`: ledger_entries_immutable
* `ledger_transactions`: ledger_transactions_immutable
* `notifications`: gd_notification_email
* `payment_orders`: maintenance_guard, payment_orders_state_guard
* `platform_settings`: platform_settings_release
* `provider_jobs`: provider_jobs_protect_snapshot, provider_jobs_space_rules, provider_jobs_state_guard
* `provider_quotes`: provider_quotes_state_guard
* `sessions`: gd_session_new_device
* `standby_commitments`: standby_commitments_state_guard
* `ticket_tiers`: ticket_tier_open_dependants, ticket_tier_release_next
* `tickets`: tickets_state_guard
* `trust_cases`: trust_cases_touch
* `users`: gala_new_user
* `workspaces`: gala_new_workspace

## Tests

| File | Tests |
|---|---|
| tests/e2e/customer/account.spec.ts | 2 |
| tests/e2e/customer/booking.spec.ts | 3 |
| tests/e2e/customer/build-canvas.spec.ts | 1 |
| tests/e2e/customer/plan-wizard.spec.ts | 1 |
| tests/e2e/customer/reviews.spec.ts | 2 |
| tests/e2e/customer/tickets.spec.ts | 4 |
| tests/e2e/customer/workflows.spec.ts | 3 |
| tests/e2e/organizer/builders.spec.ts | 2 |
| tests/e2e/organizer/create-event.spec.ts | 1 |
| tests/e2e/organizer/money-workflow.spec.ts | 2 |
| tests/e2e/organizer/poster-builder.spec.ts | 1 |
| tests/e2e/organizer/sales-proposals.spec.ts | 2 |
| tests/e2e/organizer/settings.spec.ts | 1 |
| tests/e2e/organizer/team-workflow.spec.ts | 1 |
| tests/e2e/organizer/ticket-pro.spec.ts | 2 |
| tests/foundation/foundation.spec.ts | 5 |
| tests/foundation/webhook.spec.ts | 5 |
| tests/marketplace/agent.spec.ts | 3 |
| tests/marketplace/marketplace.spec.ts | 6 |
| tests/marketplace/media.spec.ts | 4 |
| tests/marketplace/messaging.spec.ts | 3 |
| tests/marketplace/operations.spec.ts | 4 |
| tests/marketplace/payments.spec.ts | 7 |
| tests/marketplace/search.spec.ts | 2 |
| tests/marketplace/ticketing.spec.ts | 7 |
| tests/marketplace/venue-fnb.spec.ts | 7 |
| tests/phase1/accessibility/a11y.spec.ts | 3 |
| tests/phase1/e2e/journeys.spec.ts | 15 |
| tests/phase1/responsive/responsive.spec.ts | 1 |
| tests/phase1/security/rls.spec.ts | 15 |
| tests/release/agent-credits.spec.ts | 5 |
| tests/release/agent-run-types.spec.ts | 3 |
| tests/release/demo.spec.ts | 1 |
| tests/release/developer.spec.ts | 3 |
| tests/release/email.spec.ts | 1 |
| tests/release/event-cancellation.spec.ts | 2 |
| tests/release/help.spec.ts | 2 |
| tests/release/launch.spec.ts | 2 |
| tests/release/maintenance.spec.ts | 6 |
| tests/release/mfa.spec.ts | 3 |
| tests/release/privacy.spec.ts | 2 |
| tests/release/sessions.spec.ts | 2 |
| tests/release/tours.spec.ts | 1 |
| tests/release/virtual.spec.ts | 2 |
