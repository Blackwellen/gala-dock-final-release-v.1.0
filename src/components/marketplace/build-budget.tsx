import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import "@/styles/marketplace.css";

type Budget = { target: number | null; currency: string; estimated: number; requested: number; held: number; confirmed: number; paid: number; due: number;
  standby_fees: number; standby_fees_paid: number; committed: number; remaining: number | null; remaining_if_requested: number | null; replacements_needed: number };

/**
 * Live event budget (§70). Estimates, requests, holds and committed spend are separate buckets from separate sources —
 * the bar never blends an estimate into committed money.
 */
export async function BuildBudget({ eventId, compact = false }: { eventId: string; compact?: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_build_budget" as never, { p_event: eventId } as never);
  if (error || !data) return null;
  const b = data as Budget, m = (v: number | null) => money(v ?? 0, b.currency);
  const scale = Math.max(Number(b.target ?? 0), b.confirmed + b.standby_fees + b.held + b.requested + b.estimated, 1);
  const seg = (v: number) => `${Math.max(0, (v / scale) * 100)}%`;
  const rows: [string, number, string, string][] = [
    ["Confirmed", b.confirmed, "conf", "Booked suppliers at their agreed price."],
    ["Standby fees", b.standby_fees, "sb", "Fees for paid standby cover you accepted."],
    ["Conditionally held", b.held, "held", "Dates being held — not committed until you confirm."],
    ["Requested", b.requested, "req", "Quotes and requests in progress."],
    ["Estimated", b.estimated, "est", "Suggestions not yet requested."],
  ];
  return <section className="mk-budget" aria-labelledby="mk-bud-h">
    <div className="mk-budget-head"><h2 id="mk-bud-h">Budget</h2>{b.target != null && <span>Target <b>{m(b.target)}</b></span>}</div>
    <div className="mk-budget-bar" role="img" aria-label={`Committed ${m(b.committed)}${b.target != null ? ` of ${m(b.target)}` : ""}`}>
      {rows.map(([l, v, c]) => v > 0 && <i key={l} className={c} style={{ width: seg(v) }} />)}
      {b.target != null && <span className="mk-budget-target" style={{ left: seg(Number(b.target)) }} aria-hidden="true" />}
    </div>
    <dl className="mk-budget-rows">{rows.filter(([, v], i) => i < 2 || v > 0 || !compact).map(([l, v, c, hint]) => <div key={l} title={hint}><dt><i className={c} aria-hidden="true" />{l}</dt><dd>{m(v)}</dd></div>)}</dl>
    <dl className="mk-budget-money">
      <div><dt>Paid</dt><dd>{m(b.paid + b.standby_fees_paid)}</dd></div>
      <div><dt>Still due</dt><dd>{m(b.due + Math.max(b.standby_fees - b.standby_fees_paid, 0))}</dd></div>
      {b.remaining != null && <div className={b.remaining < 0 ? "over" : ""}><dt>{b.remaining < 0 ? "Over budget" : "Remaining"}</dt><dd>{m(Math.abs(b.remaining))}</dd></div>}
    </dl>
    {b.remaining_if_requested != null && b.remaining != null && b.remaining >= 0 && b.remaining_if_requested < 0 &&
      <p className="mk-note warn">If every open request is booked you’d be {m(-b.remaining_if_requested)} over budget.</p>}
    {b.replacements_needed > 0 && <p className="mk-note warn">{b.replacements_needed} supplier{b.replacements_needed > 1 ? "s" : ""} need replacing.</p>}
  </section>;
}
