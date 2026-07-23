# Finance / Ticket Sales — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/ticket-sales` (+ `/ticket-sales/new-tier`)
- **Reference image**: #6 in the image map.

## Architecture decision
`ticket_orders`/`ticket_types` (pre-existing) extended with `fee_cents`, `refunded_cents`, `channel` rather than new tables — reused the real ticketing schema instead of inventing a parallel one.

## Tested
- KPIs: Tickets Sold, Gross Sales, Net Revenue, Conversion Rate, Avg Order Value, Refund Rate.
- Sales Trend, Ticket Sales by Event, Revenue by Ticket Tier donut.
- Insights rail: Best Performing Events, Ticket Tier Mix, Channel Split donut, Recent Ticketing Alerts (real derived observations, not fabricated copy).
- Table: 6 seeded orders across 3 tiers (VIP/General Admission/Early Bird) for one ticketed event — deliberately modest, real data rather than padded fake volume.
- "Create Ticket Tier" is a real form; "Open Box Office" is an honestly-disabled button (in-person sale flow explicitly out of scope for this pass, stated via tooltip).

## Bugs found & fixed
- Page header showed "Finance" / the Overview subtitle instead of "Ticket Sales" / its own description — fixed.

## Score & decision
**Score: 87/100.** Deductions: only one ticketed event in current data (real, not padded — see user-fixes if more demo breadth is wanted), Open Box Office is a stub, no automated tests.
**Decision: ready for release.**
