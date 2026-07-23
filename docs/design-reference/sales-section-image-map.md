# Sales Section — Reference Image Map

Source folder: `working_imagesS_sales/` (8 ChatGPT-generated reference images).
Mapped by visual content inspection, not filename order.

| # | Filename | Route | View | Wizard Step | Main regions | Notes / corrections needed |
|---|----------|-------|------|-------------|---------------|------------------------------|
| 1 | `...(1).png` | `/event-manager/leads/new?step=event-details` | New Lead wizard | Step 2 of 3 — Event Details | Stepper, Event Overview (type chips, format, date, flexibility, location, city), Event Planning Details (guests, budget, purpose, ticketing, venue types, requirements, tags), Event Snapshot rail, Inspiration & References uploader, sticky footer | None — matches intent |
| 2 | `...(2).png` | `/event-manager/leads/new?step=contact` | New Lead wizard | Step 1 of 3 — Contact & Source | Contact Information, Source & Engagement, Lead Preview rail (score + SLA), Quick Tips rail, autosave badge, sticky footer | None |
| 3 | `...(3).png` | `/event-manager/leads/new?step=qualification` | New Lead wizard | Step 3 of 3 — Qualification & Review | Pipeline Qualification, Qualification Checklist, Notes & Internal Comments, Lead Review Summary, Next Actions, Lead Score ring, sticky footer | None |
| 4 | `...(4).png` | `/event-manager/leads?view=list` | Leads — List | — | KPI row (6 cards), toolbar (search/stage/source/owner/saved views/sort/view switcher), data table w/ thumbnails, Insights rail (source mix, response SLA, hot opportunities, conversion trend) | None |
| 5 | `...(5).png` | `/event-manager/leads?view=kanban` | Leads — Kanban | — | 6 stage columns (New Enquiry→Lost) w/ value totals, draggable cards w/ progress bars, Insights rail (stage distribution, hot leads, conversion metrics, pipeline value) | None |
| 6 | `...(6).png` | `/event-manager/leads?view=cards` | Leads — Cards | — | 4-col card grid, event image + score ring per card, Insights rail (source mix, SLA, hot opportunities, trend) | None |
| 7 | `...(7).png` | `/event-manager/proposals?view=cards` | Proposals — Cards | — | KPI row (6 cards), toolbar, 3-col proposal card grid w/ cover image + version + status ribbon, Insights rail (signature funnel, performance donut, expiring, accepted value trend) | Reference image's primary button reads "New Lead" — semantic generation error. Implementation uses "New Proposal" (confirmed correct in existing code, verified during build). |
| 8 | `...(8).png` | `/event-manager/proposals?view=list` | Proposals — List | — | KPI row (6 cards), toolbar, data table (proposal/event/client/type/dates/value/margin/version/owner/signature status/next action), Insights rail (signature funnel, value trend, expiring soon, top value) | None — "New Proposal" button already correct |

## Implementation notes

- Both Leads and Proposals share one `Sales` parent tab bar (`SectionTabs` → `SALES_TABS`), matching existing nav (`Sales` sidebar item → `/event-manager/leads`).
- View state (`list` / `kanban` / `cards`) is URL-driven via `?view=` on both Leads and Proposals; wizard step is URL-driven via `?step=` on `/leads/new`.
- Event "cover images" in the references are stock photography. No licensed photo library is wired up; the build uses deterministic per-event-type gradient/pattern thumbnails (`EventTypeThumb`) instead of external image URLs, consistent with the "no pasted external URLs" storage rule. Swapping in real R2-hosted photography per lead/proposal is a follow-up (see user-fixes doc).
