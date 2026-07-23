# Venue Section — Reference Image Map

Source folder: `working_imagesS_venues/` (files are ChatGPT export names, not descriptive — mapped below by visual content, originals left untouched).

| # | Original filename | Screen | Route | Selected tab/filter |
|---|---|---|---|---|
| 01 | `ChatGPT Image Jul 12, 2026, 09_32_11 PM (1).png` | All Venues | `/event-manager/venues` | Tab: All Venues |
| 02 | `ChatGPT Image Jul 12, 2026, 09_32_16 PM (10).png` | Preferred Venues | `/event-manager/venues?view=preferred` | Tab: Preferred Venues |
| 03 | `ChatGPT Image Jul 12, 2026, 09_32_14 PM (6).png` | Venue Profile — Overview | `/event-manager/venues/[venueId]/overview` | Profile tab: Overview |
| 04 | `ChatGPT Image Jul 12, 2026, 09_32_13 PM (4).png` | Venue Profile — Events | `/event-manager/venues/[venueId]/events` | Profile tab: Events, view: List |
| 05 | `ChatGPT Image Jul 12, 2026, 09_32_15 PM (8).png` | Venue Profile — Documents | `/event-manager/venues/[venueId]/documents` | Profile tab: Documents |
| 06 | `ChatGPT Image Jul 12, 2026, 09_32_15 PM (7).png` | Venue Profile — Notes | `/event-manager/venues/[venueId]/notes` | Profile tab: Notes, filter: All Notes |
| 07 | `ChatGPT Image Jul 12, 2026, 09_32_16 PM (10)` *(activity)* → see below | Venue Profile — Activity | `/event-manager/venues/[venueId]/activity` | Profile tab: Activity |
| 08 | `ChatGPT Image Jul 12, 2026, 09_32_13 PM (3).png` | Venue Profile — Maps & Access | `/event-manager/venues/[venueId]/maps-access` | Profile tab: Maps & Access |
| 09 | `ChatGPT Image Jul 12, 2026, 09_32_12 PM (2).png` | Venue Profile — Gallery & Spaces | `/event-manager/venues/[venueId]/gallery-spaces` | Profile tab: Gallery & Spaces, filter: All |
| 10 | `ChatGPT Image Jul 12, 2026, 09_32_14 PM (5).png` | Venue Profile — Commercials & Records | `/event-manager/venues/[venueId]/commercials-records` | Profile tab: Commercials & Records |

Corrected final mapping used for implementation (filenames verified by opening each file):

- `(1).png` → **01 All Venues**
- `(2).png` → **09 Gallery & Spaces**
- `(3).png` → **08 Maps & Access**
- `(4).png` → **04 Events**
- `(5).png` → **03 Overview**
- `(6).png` → **06 Notes**
- `(7).png` → **05 Documents**
- `(8).png` → **10 Commercials & Records**
- `(9).png` → **02 Preferred Venues**
- `(10).png` → **07 Activity**

## Shared shell (all 10 screens)

- Dark navy sidebar, ~166px wide, "GALA DOCK" wordmark + purple sparkle logo top-left.
- Sidebar sections: EVENT MANAGER (Dashboard, Events, Calendar, Enquiries, Proposals, Bookings, Clients), VENUES (Venues *active*, Venue Holds, Room Blocks), RELATIONSHIPS (Contacts, Communications, Tasks), INSIGHTS (Reports, Analytics), CONFIGURATION (Tags, Templates, Settings). Workspace switcher footer ("Gala Events Co. — Enterprise Plan").
- Top bar (all list/profile pages): global search "Search venues, locations, contacts…" (⌘K), `+ Create`, `Copilot`, notification bell (badge), help, avatar menu. Height ~64px.
- List pages (01, 02): H1 "Venues" + subtitle, top-level tabs (All Venues / Preferred Venues) underlined-purple active state, KPI row (5–6 cards), search+filter bar, main table/cards, right insight rail (~300px) with donut chart + ranked lists.
- Profile pages (03–10): breadcrumb (`Venues / {name}` or `< Back to Venues`), shared profile header (cover strip + avatar thumb + name + Preferred/Verified badges + rating + type/location + key metrics + action buttons), 8-tab profile nav (Overview, Events, Documents, Notes, Activity, Maps & Access, Gallery & Spaces, Commercials & Records) underlined-purple active tab, KPI row per tab, main content area, right insight rail per tab.

## Measurements (approximate, extracted from 1660×941 exports, desktop reference ≈1440–1600 viewport)

- Sidebar width: 166px fixed.
- Content max width: fluid, ~24px page gutter.
- Header height: 64px.
- Profile hero image strip: full content width × ~110px, rounded 12px, overlaps avatar thumbnail (96×96, rounded 12px, 3px white border) positioned bottom-left.
- KPI cards: ~5 per row, equal width, ~16px gap, 1px border, 12px radius, icon top-left in tinted circle.
- Right insight rail: ~300–320px, cards 12px radius, 1px border, section title + "View all" link pattern.
- Table row height: ~68–72px (media thumbnail 40×40 rounded 8px inline with venue name).
- Tabs: 40px height, 2px purple underline active state, muted grey inactive text.
- Badges: pill shape, 4px radius-ish (fully rounded), tinted background + darker text (Preferred = green, Verified = purple/blue, status badges = green/amber/red/grey).
- Typography: page titles ~28px semibold navy; card titles ~14px semibold; body ~13px; KPI value ~24px semibold.
- Border colour: neutral-200 equivalent; shadows: soft, low-elevation (card resting state), slightly larger on hover/menus.

## Do NOT reproduce

- Any screenshot artefacts, OS chrome, cropping edges — none present in these exports (clean UI renders), but if any variant image contains such artefacts, exclude.
- The generated images show illustrative/fictional data (Grand Hall London, etc.) — reproduce this as demo-seed data, not literal hardcoded UI copy.

## Responsive implications

- Sidebar collapses to icon rail <1280px, drawer <1024px (matches existing Gala Dock shell behaviour).
- Right insight rail moves below main content on tablet, into a drawer/accordion on mobile.
- Profile header stacks (cover + thumb + name block + metrics) vertically on mobile; tabs become horizontally scrollable.
- Tables convert to stacked cards under ~768px per existing Gala Dock table system.
