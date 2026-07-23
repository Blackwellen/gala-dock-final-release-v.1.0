# Inbox Section — Visual QA

## Status: visual pass completed against the live dev server

Chrome MCP was initially stuck ("browser already running") due to a large
accumulation of orphaned `chrome-devtools-mcp` processes from earlier
session reconnects. Killing all `chrome-devtools-mcp`-tagged Chrome
processes (not the user's personal browser — these are automation-only
instances) cleared it. A full authenticated visual pass then ran against
`http://localhost:3000` with real Supabase data (workspace "Grannit
Holdings").

## Screens checked

| Screen | Route/state | Result |
|---|---|---|
| All tab | `?tab=all` | Matches reference 5 after fixes below |
| Unread tab | `?tab=unread` | Matches reference 2 after fixes below |
| Conversations tab | `?tab=conversations` | Matches reference 3 — no changes needed |
| Internal tab | `?tab=internal` | Matches reference 4 — see data-limitation note below |
| Full direct-chat thread | Sarah Chandler conversation | Matches reference 5 detail |
| Full group-chat thread | Production Planning – Gala 2025 (pinned attachment) | Matches reference 6 in spirit — see pinned-banner gap below |
| Copilot panel — All chats | Gala Copilot → Inbox tab | Matches reference 8 closely |
| Copilot panel — direct chat | Gala Copilot → Inbox → conversation | Matches reference 7 closely |
| New Message dialog | Compose flow | Works correctly, all conversation types selectable |
| Mobile (390×844) | Full Inbox | Fixed — see mobile split-pane bug below |
| Tablet (1024×800) | Full Inbox | Clean |
| Desktop (1440×900) | Full Inbox | Clean |
| Event Profile Comms tab | `/event-manager/events/[id]/comms` | Confirmed working end-to-end in the real app shell with real canonical data |

## Bugs found live and fixed in this pass

1. **Avatar initials used the conversation title, not the other participant's name.** `ConversationAvatar` was showing initials like "PS" (from "Production schedule...") instead of "SC" for Sarah Chandler. Fixed in `queries.ts` — avatar initials now derive from `otherParticipants[0].displayName` when available.
2. **Duplicated search placeholder text.** Showed "Search conversations conversations…" on the All and Conversations tabs. Fixed in `InboxClient.tsx` with explicit per-tab wording.
3. **KPI card label truncation.** `KPIGrid`'s default `xl:grid-cols-5` left 4 cards narrower than needed (this app's `cn()` is plain `clsx`, not tailwind-merge, so a className override didn't reliably beat the component's own utility classes). Replaced with a plain `grid-cols-2 lg:grid-cols-4` wrapper local to the Inbox page.
4. **Wrong empty-state copy on the Unread tab.** After all messages were read, the Unread tab showed "Start a new conversation…" (implying zero conversations exist) instead of "You're all caught up". Fixed by keying the empty-state message off `metrics.totalConversations` (true zero-state) vs. the current tab's filtered `visible.length` (this tab has none right now), with tab-specific copy.
5. **Migrated `event_comms` conversations had a redundant title suffix.** Titles read "Pulse Summit & After Dark 2026 — supplier" while the row also showed a "Supplier" badge next to it. Fixed the source migration to omit the suffix (and changed the idempotency dedup key from `title` to `(event_id, type)` so distinct recipient-type groups don't collide once the suffix is gone), then patched the 5 already-migrated conversations live.
6. **Mobile: the thread pane was `hidden lg:flex`, so tapping a conversation had no visible effect below the `lg` breakpoint.** This was a real functional gap against the task brief's explicit mobile requirement (list screen + dedicated thread screen + back button). Fixed: the list and thread panes now toggle based on whether a conversation is selected (list-only when none selected, thread-only with a back arrow when one is), matching the required mobile pattern. Verified working at 390×844 (list → thread → back → list).

## Known data limitation (not a code bug, already documented)

The seeded workspace has only one real `auth.users`/`workspace_members` row.
Every named seed slot (Alex Lee, Emma Wilson, Kevin Brooks, ...) collapses to
that single real user due to the participants table's per-user uniqueness
constraint, so: (a) internal group messages all render as "You" / sent by
the current user, and (b) group conversations show as 2-participant (you +
collapsed slot) rather than the 6-7 participants depicted in reference
images 4 and 6. Confirmed via direct DB query. Re-seeding after adding real
teammates to the workspace will produce the full participant variety —
tracked in `release-gated/user-fixes/inbox-section.md`.

## Follow-up UI gap found during this pass (added to user-fixes)

The reference design (image 4/6) shows a distinct "Pinned by you" banner
with the pinned file above the message timeline. The data layer supports
per-message pinning (`messages.pinned_at`/`pinned_by`, seeded on the first
message of "Production Planning – Gala 2025"), but no dedicated pinned-
message banner component exists yet — the pinned message currently just
renders inline in its normal position in the timeline. Added to user-fixes
as a same-day follow-up (additive UI only, no schema change needed).
