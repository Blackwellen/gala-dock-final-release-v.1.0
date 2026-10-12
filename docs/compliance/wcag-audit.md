# WCAG 2.2 AA audit — October 2026 release

**Date:** 12 October 2026 · **Scope:** the 79 main routes of the Customer app, Professional Organizer and public pages (landing, discover, event pages, checkout, tickets, planning and booking flows, organizer workspace and wizards), audited in the signed-in role that reaches each route.

## Method

* **Automated:** axe-core 4 via `@axe-core/playwright`, rule tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, on every route at desktop width (1440px, default 0.8 density zoom, so on-screen sizes were measured as users see them). Run with `AXE=1 node scripts/design/audit-p2.mjs`; raw results are written to `artifacts/visual/axe-p2.json`.
* **Reflow:** a 390px mobile audit of all 79 routes (`MOBILE=1`): one navigation per breakpoint, no horizontal page scroll.
* **Manual:** keyboard-only and focus-visibility checks on core journeys (discover → event → checkout → ticket; plan → book → pay; organizer create event → ticket setup → publish).

## Results

| Pass | Routes clean | Violating nodes |
| --- | --- | --- |
| Baseline | 1 / 79 | ~600 (colour contrast 359, target size 189, ARIA roles and attributes, names) |
| After fixes | 75 / 79 | 4 routes with map pins only (accepted exception below) |

### What was fixed

* **1.4.3 Contrast (minimum):** status colours (green, red, amber, pink, cyan) and muted text were retuned to at least 4.5:1 on white and on their tinted chip backgrounds, through scoped palette tokens plus 117 hard-coded values in 36 stylesheets. Badge backgrounds were darkened, and hidden or disabled rows now use italic muted text instead of opacity. Status no longer relies on colour alone: seating chips carry a coloured border and a dot, with neutral text.
* **2.5.8 Target size (minimum):** toggles, checkboxes, radios, inputs, selects, icon-only buttons, breadcrumb and Back links, map zoom controls, save hearts and card actions now reach at least 24×24 CSS px on screen, after the density zoom is applied.
* **4.1.2 Name, role, value / 1.3.1 Info and relationships:**
  * Navigation links styled as tabs now use `aria-current="page"` instead of `aria-selected` or `aria-pressed`, and their containers are labelled groups rather than `tablist`s.
  * In-page toggle buttons use `aria-pressed`.
  * The month calendar no longer exposes an incomplete grid; day names are decorative, and each day is a labelled group.
  * Star ratings and icon badges have `role="img"` with labels.
  * Unlabelled inputs, selects, image pickers and gallery thumbnails now have accessible names.

### Accepted exceptions

| Item | Routes | Criterion | Rationale |
| --- | --- | --- | --- |
| Map pins (price and name markers) | /discover map view, /plan step 2, /organizer/marketplace | 2.5.8 | Equivalent exception: every pin has a matching item in the list or cards shown beside the map, and those meet the size requirement. |
| Decorative step numbers on the landing page | / | 1.4.3 | Marked `aria-hidden`; the step headings carry the meaning. They have been darkened anyway. |

### Closed after the scan

* **Seat map editor labels** (`/organizer/events/[id]/map`): small status text was 3.69:1 (#7a80c0). It is now #5d60a8 (5.67:1) in venue-plan.css and provider-space.css (commit ee92af9), and in the page's inline `.ep-tiers small` rule.
* **Media Studio export checkboxes:** these were re-spaced to 32px rows so their 24px target circles don't overlap.

## Not covered by automated testing

* Pointer-drag canvases (Media Studio, venue map builder): keyboard alternatives exist for selected elements (arrow keys and property fields), but complex layout still favours a pointer.
* Analytics charts: the numbers are in adjacent tables; full text alternatives for each chart are still to do.
* Organiser-uploaded images and descriptions: we prompt for alt text but can't guarantee it.
* Screen-reader passes with NVDA, JAWS, VoiceOver and TalkBack, and testing with disabled users, are recommended as part of the independent audit before production launch.

## Re-running

```
AXE=1 MSYS_NO_PATHCONV=1 node --env-file=.env --env-file=.env.local scripts/design/audit-p2.mjs [route-filter]
```

The dev server must be running. Re-run after any change to kit.css or the palette tokens.
