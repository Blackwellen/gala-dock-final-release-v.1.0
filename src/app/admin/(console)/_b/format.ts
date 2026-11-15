/** Compact chart labels ("Oct 2") in Europe/London. */
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "short", day: "numeric" });
export function shortDay(ms: number) {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return `${(parts.month ?? "").slice(0, 3)} ${parts.day}`;
}
/** "14 Nov 2026, 10:24" in Europe/London. */
export function stamp(iso: string | null | undefined, withYear = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(d).replace("Sept", "Sep");
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date}, ${t}`;
}
/** "12 mins ago", "2 hours ago", "3 days ago". */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
/** "2h 18m" from minutes. */
export function dur(mins: number) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
/** Q51: "YYYY-MM-DD" of an instant in Europe/London (UTC slicing gave yesterday's date between midnight and 01:00 BST). */
export function londonYmd(v: string | number | Date = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(v));
}
/** Q51: "YYYY-MM-DD HH:mm" London wall time for CSV exports. */
export function londonStamp(v: string | number | Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(v)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
/** Q75: Stripe dashboard deep link for a ledger reference. Platform charges (subscriptions, boosts) live on the platform account and
 *  use search; DEC-107 direct charges and payouts live on the seller's connected account, which the platform's search never finds, so
 *  they need the account-scoped URL (dashboard.stripe.com/<acct>/[test/]payments/<id>). Unknown connected account → null (hide the button). */
export function stripeDashboardUrl(ref: string | null | undefined, target: { platform: boolean; account: string | null }, livemode: boolean) {
  if (!ref) return null;
  const mode = livemode ? "" : "test/";
  if (target.platform) return `https://dashboard.stripe.com/${mode}search?query=${encodeURIComponent(ref)}`;
  if (!target.account || !/^acct_[A-Za-z0-9]+$/.test(target.account)) return null;
  const id = encodeURIComponent(ref), acct = target.account;
  if (/^po_/.test(ref)) return `https://dashboard.stripe.com/${acct}/${mode}payouts/${id}`;
  if (/^(pi_|ch_|py_)/.test(ref)) return `https://dashboard.stripe.com/${acct}/${mode}payments/${id}`;
  return `https://dashboard.stripe.com/${acct}/${mode}search?query=${id}`;
}
