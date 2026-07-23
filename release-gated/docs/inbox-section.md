# Inbox / Messaging Section — Release Evidence

**Section name:** Inbox (canonical messaging engine)
**Routes:** `/event-manager/inbox`, `/event-manager/inbox?tab=all|unread|conversations|internal&conversation=<id>`, legacy `/event-manager/inbox/[threadId]` (redirects), `/event-manager/events/[eventId]/comms` (Event Profile Comms tab, now reads/writes the same canonical model), Gala Copilot floating panel → Inbox tab.
**Scope of this pass:** full replacement of the old log-only "communications" activity log with a real, persisted, Realtime, canonical conversations/messages engine, per the user's explicit decisions: (1) phased delivery — schema+UI first, then realtime/wiring, then hardening; (2) replace the log-only model with real live messaging; (3) unify `communications` + `event_comms` into one canonical model.

## 1. What was built

### Reference image map
`docs/design-reference/inbox-section-image-map.md` — all 9 reference images opened and mapped to route/panel state by visible content (not filename). All 9 confirmed matching the task brief's expected mapping.

### Canonical schema (migrations, all applied directly via `supabase db query --linked`)
- `20260713_inbox_messaging_core.sql` — `conversations`, `conversation_participants`, `messages`, `message_attachments`, `message_reactions`, `message_mentions`. RLS helper functions `is_conversation_participant`, `is_internal_conversation_participant`, `is_conversation_admin` (SECURITY DEFINER). Full RLS policy set (SELECT/INSERT/UPDATE, no DELETE — deletion is soft via `withdrawn_at`/`archived_at`/`removed_at`). Triggers for `updated_at` maintenance and `conversations.last_message_at` bump on new message.
- `20260713_inbox_messaging_realtime.sql` — adds all 6 tables to the `supabase_realtime` publication (idempotent membership check).
- `20260713_notifications_table_backfill.sql` — the live `notifications` table had **no tracked migration file at all** (confirmed via research: used in `src/lib/shell/data.ts` but absent from every file in `supabase/migrations/`). Added a `CREATE TABLE IF NOT EXISTS` backfill (no-op against production, lets a fresh DB reproduce it) plus the one policy that was genuinely missing live — **INSERT** (only SELECT/UPDATE existed, under different policy names with equivalent `user_id = auth.uid()` semantics, confirmed via `pg_policies` before touching anything).
- `20260713_migrate_event_comms_to_conversations.sql` — one-time data migration folding the 16 existing `event_comms` rows (0 rows existed in `communications`, nothing to migrate there) into canonical conversations (grouped by event + recipient_type) and messages. Idempotent (re-run-safe dedup check). Verified: **16/16 source rows → 16 messages across 5 conversations**.

All migrations regenerated `src/lib/supabase/database.types.ts` via `supabase gen types typescript --project-id <ref>` after schema changes.

### R2 attachment wiring
- `src/app/api/r2/presign/route.ts` — new `message-attachment` upload kind (25 MB cap; PDF/image/Office/CSV/plain-text MIME allowlist).
- `src/app/api/r2/presign-download/route.ts` — added a conversation-participant authorization check specifically for `message-attachment` keys (previously this generic endpoint only checked workspace membership — closed a real gap where any workspace member could download any message attachment by object key, not just participants of that conversation).
- `src/lib/messaging/attachments-client.ts` — client-side upload (presign → direct PUT to R2) / download (presign-download → open signed URL) helpers.

### Canonical query/action layer (single source of truth for all 3 surfaces)
- `src/lib/messaging/types.ts`, `queries.ts` (read: `listConversations`, `getInboxMetrics`, `getConversationDetail`, `listMessages` — cursor-paginated, hydrates participants/attachments/reactions/seen-by in bulk queries, not per-row), `actions.ts` ("use server" writes: `createConversation`, `sendMessage`, `editMessage`, `withdrawMessage`, `toggleReaction`, `markConversationRead`/`markAllConversationsRead`, `pin/unpin/mute/unmute/archive`, `addParticipant`/`removeParticipant`/`leaveConversation`), `client-queries.ts` (Server Action read wrappers so the client-only Copilot panel can fetch without a dedicated API route per query), `realtime.ts` (client hooks: `useConversationRealtime`, `useConversationListRealtime` — Supabase Realtime `postgres_changes` subscriptions, debounced refetch, always refetching the already-persisted row rather than trusting the wire payload as source of truth), `format.ts` (pure date/size formatting helpers — unit tested).

### Full Inbox UI (`src/app/event-manager/inbox/`)
`page.tsx` (server, reads `tab`/`conversation` from the URL, fetches conversations + metrics + selected-conversation detail + messages), `InboxClient.tsx` (tabs, KPI row, search, split list/thread layout, live-updating list via Realtime), `NewMessageDialog.tsx` (replaces the old `ComposeDialog` — creates client/supplier/internal/group/note conversations with a real opening message, supports a locked-event mode reused by the Comms tab). Shared components in `src/components/inbox/`: `ConversationAvatar` (deterministic colour per id), `ConversationBadge`, `ConversationListItem`, `ConversationThread` (header, day-grouped message timeline, Realtime-backed), `MessageBubble` (internal-note styling, reactions, seen-by, edited/withdrawn states), `MessageComposer` (attach, emoji, @mention insertion, internal-note mode), `AttachmentChip` (signed download).

### Gala Copilot panel Inbox tab (`src/components/copilot/CopilotInboxPanel.tsx`)
The panel already had Copilot/Inbox tabs before this work, but Inbox was a dead-end stub ("your conversations live in the Inbox" + a link out). Replaced with a real compact list (search, unread badges, Realtime-live) and a real compact thread (reusing the exact same `ConversationThread` component the full Inbox uses, just with `compact` styling) — **one canonical implementation, not two**, per the task brief's explicit "no duplicated messaging implementations" requirement.

### Event Profile Comms tab (`src/app/event-manager/events/[eventId]/comms/`)
Previously read a separate `event_comms` table and had two non-functional buttons ("Draft Email"/"New Message" — no `onClick` at all). Rewritten to call `listConversations(..., { eventId })` against the canonical model and render the same `ConversationListItem` component, with working "New Message"/"Draft Message" buttons that open `NewMessageDialog` locked to this event.

### Demo seed
`supabase/seeds/inbox-section-demo-seed.sql` — idempotent (fixed UUIDs, `WHERE NOT EXISTS` guards), applied to workspace "Grannit Holdings" (`045a53a6-d421-4836-bf9e-e7a5cf998834`). Verified: **13 conversations, 26 messages, 17 participants, 2 attachments, 3 reactions**. Matches every conversation name shown in the reference images (Sarah Chandler / Skyline Events Inc., North Ridge Production, James Brown, The Ritz London, Peak Works, Alex Lee, Production Planning – Gala 2025, Summer Gala Production Team, Stage & AV Alignment, Vendor Load-In Coordination, Catering & Hospitality Update, Marketing & Comms Sync, Volunteer Briefing Notes).

## 2. Real-time messaging (replaces log-only model, per user decision)

- All 6 messaging tables are members of the `supabase_realtime` publication (verified via `pg_publication_tables`).
- `useConversationRealtime` subscribes to `messages`/`message_reactions`/`conversation_participants` changes scoped to the open conversation; `useConversationListRealtime` (full Inbox) and an equivalent inline subscription (Copilot panel) keep the conversation list's unread counts/previews live workspace-wide.
- Every insert/update is persisted server-side (via the `actions.ts` Server Actions, RLS-enforced) *before* Realtime delivery — Realtime is a refresh signal, not the source of truth, matching the brief's explicit requirement.
- Notifications: `sendMessage`/`createConversation` now call `notifyNewMessage`, inserting rows into the existing `notifications` table (read by the bell icon `NotificationsMenu`) for every other internal participant who isn't muted — mentioned users get a distinct `inbox_mention` category/title. External client/supplier participants are never notified (no user_id to target — see Known limitations).

## 3. Verification performed

- `npx tsc --noEmit` — clean for every inbox/messaging/copilot/comms file (grepped explicitly). 3 pre-existing errors remain in unrelated files (`StatusBadge.tsx`, `automations/data.ts`) — present before this work, not touched.
- `npm test` — 77/77 pass, including 3 new tests (`test/messaging-format.test.ts`) covering `formatFileSize` and the conversation-type → badge mapping.
- Direct DB verification via `supabase db query --linked` after every migration: table existence, publication membership, RLS policy list (`pg_policies`) diffed against the migration source line-by-line — all match.
- RLS structural audit: confirmed every expected SELECT/INSERT/UPDATE policy exists on all 7 tables (6 new + `notifications`) with the exact `qual`/`with_check` expressions from the migration.
- RLS **positive** test: a real participant can SELECT their own conversation and its messages (confirmed via `SET LOCAL ROLE authenticated` + `request.jwt.claims` impersonation).
- RLS **negative** tests: attempted but this project currently has only **one real `auth.users` row and one workspace** — there is no second identity to play the "outsider" or "different workspace" role live. See `release-gated/user-fixes/inbox-section.md` for what to run once a second test user/workspace exists.

## 4a. Chrome MCP visual QA — completed

The stuck browser session reported in earlier evidence was resolved
(orphaned `chrome-devtools-mcp` processes from prior reconnects were
cleared). A full authenticated visual pass then ran against all 9 reference
images, mobile/tablet/desktop breakpoints, and the Event Profile Comms tab.
Full detail in `docs/qa/inbox-section-visual-qa.md`. Six real bugs were
found live and fixed in this same session:

1. Avatar initials derived from the conversation title instead of the other participant's name (fixed in `queries.ts`).
2. Duplicated "Search conversations conversations…" placeholder text (fixed in `InboxClient.tsx`).
3. KPI card label truncation caused by `KPIGrid`'s default 5-column layout not overriding cleanly (this repo's `cn()` is plain `clsx`, not tailwind-merge) — replaced with a local 4-column grid.
4. Wrong empty-state copy on the Unread tab ("start a new conversation" instead of "you're all caught up") once conversations existed but none were unread.
5. Redundant title suffix on migrated `event_comms` conversations (e.g. "— supplier" duplicating the badge) — fixed the migration source and patched the 5 live rows; also fixed the dedup key to `(event_id, type)` instead of `title` so this doesn't reintroduce a collision bug.
6. **Mobile split-pane gap**: the thread pane was `hidden lg:flex`, so selecting a conversation below the `lg` breakpoint had no visible effect — a real functional gap against the task brief's mobile requirement. Fixed with a proper list↔thread toggle plus a back-arrow control, verified at 390×844.

## 4. NOT done in this pass (see user-fixes doc)

- Chrome MCP pixel-comparison QA — blocked by a stuck browser MCP session this session could not safely clear. See `docs/qa/inbox-section-visual-qa.md`.
- Live cross-user/cross-workspace RLS negative testing — no second identity exists in this project yet.
- Full @mention autocomplete UX (currently inserts a fixed `@[Name](userId)` token via a simple participant-picker dropdown, not a live-filtered inline autocomplete).
- Message editing/reply-to UI affordances exist in the data layer (`editMessage`, `reply_to_message_id`) but are not yet exposed as buttons in `MessageBubble` (only reactions and withdrawal-display are wired in the UI; edit/reply composer entry points are a follow-up).
- Typing indicators and presence (Supabase Realtime Presence/Broadcast) — not implemented this pass; only message/reaction/read-state Realtime.
- Conversation Details drawer (participants management UI, mute/archive/pin as UI controls beyond the header pin button) — server actions exist (`addParticipant`, `removeParticipant`, `muteConversation`, `archiveConversationForSelf`, etc.) but are not yet wired to dedicated UI.
- Full external client/supplier **portal** identity — this repo has no `client_users`/`supplier_users` portal-auth table yet, so external participants are stored as name/email snapshots (no login), and cannot be notified or independently RLS-tested as a real identity. This is a pre-existing repo gap, not introduced by this work — flagged for a future portal-auth project.
