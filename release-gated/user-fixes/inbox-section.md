# Inbox / Messaging Section — Manual Follow-ups

Everything below is genuinely outside what I could complete this pass — either it needs your credentials/decisions, a second test identity that doesn't exist yet, or tooling access that was unavailable. Nothing here is "I chose not to bother."

## 1. Chrome MCP visual QA — RESOLVED, completed this session

The `chrome-devtools` MCP server's earlier "browser already running" block
was cleared by killing the accumulated orphaned `chrome-devtools-mcp` Chrome
processes from prior reconnects. A full visual pass then ran against all 9
reference images, mobile/tablet/desktop breakpoints, and the Event Profile
Comms tab — 6 real bugs were found and fixed live. Full detail in
`docs/qa/inbox-section-visual-qa.md` and section 4a of the release-evidence
doc. No action needed here.

## 1b. Add a dedicated pinned-message banner

The reference design (images 4/6) shows a distinct "Pinned by [name]" banner
with the pinned file rendered above the message timeline, separate from
where that message naturally falls in the conversation. The data layer
already supports this (`messages.pinned_at`/`pinned_by`, seeded on one
message in "Production Planning – Gala 2025"), but `ConversationThread`
doesn't yet render a separate pinned banner — the pinned message just shows
inline at its normal timeline position. This is additive UI work, no schema
change needed — ask me to build it as a follow-up.

## 2. Live cross-user / cross-workspace RLS negative testing

This project currently has **one real `auth.users` row and one workspace**
("Grannit Holdings"). I confirmed every RLS policy exists with the correct
definition (structural audit, see release doc), and confirmed a real
participant *can* see their own conversation (positive test). I could not
run genuine negative tests (a non-participant being blocked, a different
workspace's member being blocked) because there's no second identity to
impersonate.

**What to do:** once a second team member or a second workspace exists,
ask me to re-run:
```
supabase db query --linked -f <negative-test-script>
```
using `SET LOCAL ROLE authenticated` + `request.jwt.claims` impersonation of
that second user, exactly as done for the positive test. I can regenerate
the test script instantly — the logic is already written, it just needs a
second identity to point at.

## 3. Add more real team members for realistic group-chat seed data

The seed script (`supabase/seeds/inbox-section-demo-seed.sql`) cycles named
slots (Alex Lee, Emma Wilson, Kevin Brooks, Lena Harris, Maya Patel, Jordan
Kim, Taylor Morgan, James Brown) across real `workspace_members` rows. With
only one real member, every slot collapses to that one person, so group
conversations show 1 participant instead of the 6-7 shown in the reference
images.

**What to do:** invite a few more real team members to the "Grannit
Holdings" workspace via your normal invite flow, then re-run the seed
script (it's idempotent — safe to re-run, it will only add the
now-available member slots it was missing). No code change needed.

## 4. Wire the remaining messaging UI affordances

The following have working server actions already (`src/lib/messaging/actions.ts`)
but no UI button yet:
- **Edit message** — `editMessage(messageId, body)` exists; `MessageBubble` doesn't yet show an edit control on hover for the sender's own messages.
- **Reply-to** — `messages.reply_to_message_id` and `sendMessage({ replyToMessageId })` exist; no "Reply" button/quoted-preview UI yet.
- **Conversation Details drawer** — participant list/roles management, mute, archive-for-self all have server actions (`addParticipant`, `removeParticipant`, `muteConversation`, `archiveConversationForSelf`, etc.) but "View details"/"View contact" currently only calls an `onOpenDetails` callback stub with no drawer component behind it yet.

**What to do:** ask me to build these as a follow-up pass — they're
additive (no schema/RLS changes needed), should be a same-day task once
picked up.

## 5. Typing indicators and presence

Not implemented this pass — only message/reaction/read-state Realtime
subscriptions exist. Supabase Realtime Presence/Broadcast channels would be
needed for "X is typing…" and online/offline dots. Flagged as a distinct
follow-up since it's a different Realtime primitive (ephemeral, not
`postgres_changes`) from what's built now.

## 6. Client/supplier portal identity (pre-existing repo gap, not new)

There is no `client_users`/`supplier_users` portal-auth table in this repo
today — external participants in conversations are stored as
name/email snapshots, not real logins. This means:
- External participants cannot receive in-app notifications (no `user_id` to target).
- External participants cannot be RLS-tested as a real identity (they aren't one).
- The Client Portal / Supplier Portal messaging surfaces mentioned in the task brief cannot be wired to real per-external-user auth until a portal-auth project exists.

This was true before this Inbox rebuild and is out of scope to fix here —
flagging so it's tracked rather than silently assumed away.

## 7. `event_comms` table left in place (not dropped)

The 16 legacy rows were copied (not moved/deleted) into canonical
conversations/messages via `20260713_migrate_event_comms_to_conversations.sql`.
The `event_comms` table itself was deliberately **not dropped** — it's no
longer read by any code path (confirmed), but dropping a table on a linked
production project without your explicit go-ahead felt like the wrong
default. Say the word and I'll drop it (and `communications`, which has 0
rows) in a follow-up migration.
