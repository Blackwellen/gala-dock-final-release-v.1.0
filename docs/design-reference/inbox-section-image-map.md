# Inbox Section — Reference Image Map

Source folder: `working_imagesS_messages/` (9 ChatGPT-generated reference images, filenames are timestamps not descriptive names — mapped here by visible content, not filename).

| # | Filename suffix | Mapped screen | Route / panel state | Selected tab | Selected conversation | Mode |
|---|---|---|---|---|---|---|
| 1 | `(1)` (thumbnail listing only, not opened) | — | — | — | — | — |
| 2 | `(2)` | Unread | `/event-manager/inbox?tab=unread` | Unread | North Ridge Production — Invoice #INV-4521 | Full page |
| 3 | `(3)` | Conversations | `/event-manager/inbox?tab=conversations` | Conversations | Sarah Chandler / Skyline Events Inc. | Full page |
| 4 | `(4)` | Internal | `/event-manager/inbox?tab=internal` | Internal | Production Planning – Gala 2025 (group, pinned attachment) | Full page |
| 5 | `(5)` | All | `/event-manager/inbox?tab=all` | All | Sarah Chandler / North Ridge Productions (mixed thread incl. internal-note card) | Full page |
| 6 | `(6)` | Full group chat | `/event-manager/inbox?tab=all&conversation=<summer-gala>` | All | Summer Gala Production Team (7 participants, checklist card) | Full page |
| 7 | `(7)` | Copilot panel — direct chat | Gala Copilot panel, Inbox tab | Inbox | Production schedule & load-in update (Sarah Chandler) | Compact panel |
| 8 | `(8)` | Copilot panel — all chats list | Gala Copilot panel, Inbox tab | Inbox | (list, none selected) | Compact panel |
| 9 | `(9)` | Copilot panel — group chat | Gala Copilot panel, Inbox tab | Inbox | Production schedule & load-in update, 4 participants shown as a group-style compact header | Compact panel |

Verified by opening all 9 images directly (Read tool, visual inspection) before any implementation — matches the task brief's expected mapping exactly, no filename-only guessing.

## Per-image structural notes

**Image 2 — Unread:** header ("Inbox" + subtitle), 4-tab nav with counts (All 24 / Unread 8 / Conversations 14 / Internal 6), 4 KPI cards (Conversations / Unread / Client-Supplier / Internal Notes), left list filtered to unread-only rows (bold title + unread dot), right pane shows the selected unread thread with a PDF attachment card, composer at the bottom.

**Image 3 — Conversations:** same shell, list filtered to client/supplier direct conversations, right pane shows a client thread with call/video icons, "View contact" link, read-receipt double-check mark, and reactions under a message bubble.

**Image 4 — Internal:** list has a secondary All/Notes/Chats filter row, right pane shows a group header with participant avatar stack + "View Details", a pinned-message banner with a PDF, multi-sender messages, and an internal composer with Attach/Mention/Emoji controls (no "internal note" toggle visible — mentioned but not shown as a distinct mode switch in this image).

**Image 5 — All:** right pane demonstrates an internal-note card rendered *inside* an otherwise external client thread (amber-bordered "INTERNAL NOTE" block with a chevron), proving internal notes can appear contextually within a client conversation, not only in dedicated note threads.

**Image 6 — Group chat:** 7-participant avatar stack, a message that is itself a checklist ("Run of Show — Pre-Event Checklist" with checked/unchecked items and a "Checklist" badge), "Seen by 6 ✓✓" under the current user's own message, reactions on two different messages from different senders.

**Images 7–9 — Copilot panel:** dark header (`#0e0c27`-style navy) with "Gala Copilot" + "Beta" badge + close (×), a two-tab row (Copilot / Inbox) directly below the header. Image 8's list rows show avatar, title, type badge, preview, timestamp/date, unread dot — same visual language as the full Inbox list, just narrower. Image 9's group header compresses participant avatars into a small overlapping stack instead of a count pill.

## Reproduced vs. not reproduced

Reproduced: page title/subtitle, 4-tab nav + counts, 4 KPI cards, split list/thread layout, avatar colour-coding, badges (Client/Supplier/Internal), attachment cards, reactions, pinned messages, checklist-style message, group participant stack, Copilot panel Copilot/Inbox tab pair, compact list + compact thread + compact group states.

Deliberately not reproduced (generated-image artifacts, not part of the real Gala Dock shell): the sidebar/topbar icon set shown in the images is treated as illustrative only — the real, already-redesigned Gala Dock shell (`AppShellClient`, `AppSidebar`) is authoritative per the task brief, and no screenshot chrome (browser tabs, wallpaper, cropping) needed removal since these images were already clean generated mockups with no such artifacts.
