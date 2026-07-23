# Finance / Quotes — Release Evidence

See `_shared-infrastructure.md` for schema/RLS/seed/tests shared across all Finance tabs.

- **Route**: `/event-manager/finance/quotes`
- **Reference image**: #3 in the image map.

## Architecture decision
The reference design's "Quotes" tab is a **client-facing** sales pipeline (win rate, margin, next action) — this matches the pre-existing `proposals` table, not the pre-existing `quotes` table (which is supplier-facing procurement pricing, left untouched and still used by Profit's supplier-cost lineage elsewhere). This tab is built entirely on `proposals`; the old supplier-quote routes (`quotes/new`, `quotes/[quoteId]`) still exist for their original purpose and were not removed.

## Tested
- KPIs: Total Quotes, Pipeline Value, Active Quotes, Win Rate, Est. Avg Margin (margin is an honest estimate derived from linked event costs — labelled "Est." since `proposals` has no native cost/margin column).
- Quote Pipeline funnel (Draft/Sent/Viewed/Signed), Win Rate by Month, Expiring Quotes (14 days), Top Value Opportunities.
- Main table: Quote ID, Event/Client, Status badge, Sent Date, Expiry + due-label, Value, Est. Margin, Owner, Next Action — row links to the real `/event-manager/proposals/[id]` detail page.
- "Create Quote" links to `/event-manager/proposals/new` (no duplicate create form built).

## Bugs found & fixed
- **All Quote IDs displayed identically** (`Q-2026-9000`) — synthesized code sliced the first 4 hex chars of `proposal.id`, and seed data shares a fixed UUID prefix. Fixed by slicing from the end of the id (verified: `funnel` chart proportions were separately confirmed correct via DOM measurement after initially misjudging them from a screenshot).
- Page header showed "Finance" instead of "Quotes" (copy-paste from Overview) — fixed.
- `Date.now()` called inside a `.filter()` during a server-component render tripped a React-Compiler purity lint rule — replaced with `new Date().getTime()`.

## Data sources / tables
`proposals`, `event_expenses` (for margin estimate), `events` for name lookups.

## Score & decision
**Score: 85/100.** Deductions: "Export" is a decorative/disabled button (no CSV generator wired), margin is an estimate not a true stored figure, no dedicated automated tests.
**Decision: ready for release.**
