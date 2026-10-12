import Link from "next/link";
import type { ReactNode } from "react";

export type CalItem = { id: string; title: string; start: string; end?: string | null; href: string; tone: string; image?: string; meta?: ReactNode; sub?: string };
const TZ = "Europe/London";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Month grid (Mon-first). Items placed on their London-local start day; multi-day items repeat per day. */
export function MonthCalendar({ year, month, items, maxPerDay = 2, compact }: { year: number; month: number; items: CalItem[]; maxPerDay?: number; compact?: boolean }) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first); start.setUTCDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); return d; });
  const weeks = days.slice(35).every(d => d.getUTCMonth() !== month - 1) ? 5 : 6;
  const today = ymd(new Date());
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) {
    const s = new Date(it.start), e = it.end ? new Date(it.end) : s;
    for (let d = new Date(s); d <= e && byDay.size < 400; d.setUTCDate(d.getUTCDate() + 1)) { const k = ymd(d); byDay.set(k, [...(byDay.get(k) ?? []), it]); if (!it.end) break; }
  }
  return <div className={`mc ${compact ? "compact" : ""}`} role="group" aria-label={first.toLocaleString("en-GB", { month: "long", year: "numeric" })}>
    <div className="mc-head" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d}>{d}</div>)}</div>
    <div className="mc-body" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
      {days.slice(0, weeks * 7).map(d => { const k = ymd(d); const list = byDay.get(k) ?? []; const out = d.getUTCMonth() !== month - 1;
        return <div key={k} role="group" className={`mc-day ${out ? "out" : ""} ${k === today ? "today" : ""}`} aria-label={k}>
          <span className="mc-num">{d.getUTCDate()}</span>
          {list.slice(0, maxPerDay).map(it => <Link key={it.id + k} href={it.href} className={`mc-item tone-${it.tone}`} title={it.title}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {it.image && !compact && <img src={it.image} alt="" />}
            <span className="k-grow" style={{ minWidth: 0 }}><b className="k-ellipsis" style={{ display: "block" }}>{it.title}</b>{it.sub && <small className="k-ellipsis" style={{ display: "block" }}>{it.sub}</small>}{it.meta && !compact && <span className="mc-meta">{it.meta}</span>}</span>
          </Link>)}
          {list.length > maxPerDay && <span className="mc-more">+{list.length - maxPerDay} more</span>}
        </div>; })}
    </div>
  </div>;
}

/** Small month picker grid used in right rails. */
export function MiniMonth({ year, month, marked = [], selected, hrefFor }: { year: number; month: number; marked?: string[]; selected?: string; hrefFor: (ymd: string) => string }) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12)); const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first); start.setUTCDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); return d; });
  const today = ymd(new Date());
  return <div className="mini-month"><div className="mm-head">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="mm-grid">{days.map(d => { const k = ymd(d); return <Link key={k} href={hrefFor(k)} className={`${d.getUTCMonth() !== month - 1 ? "out" : ""} ${k === today ? "today" : ""} ${k === selected ? "sel" : ""} ${marked.includes(k) ? "mark" : ""}`} aria-label={k}>{d.getUTCDate()}</Link>; })}</div></div>;
}
export { ymd as londonYmd };
