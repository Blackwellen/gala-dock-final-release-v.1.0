import Link from "next/link";

/** Sales sub-navigation (design Sales sub-nav): Leads · Proposals · Contracts · Clients. */
export function SalesNav({ active }: { active: "leads" | "proposals" | "contracts" | "clients" }) {
  const items = [["leads", "Leads", "/organizer/sales"], ["proposals", "Proposals", "/organizer/sales?tab=proposals"], ["contracts", "Contracts", "/organizer/sales/contracts"], ["clients", "Clients", "/organizer/sales/clients"]] as const;
  return <nav className="k-tabs" aria-label="Sales" style={{ marginBottom: 12 }}>{items.map(([k, l, href]) => <Link key={k} className="k-tab" href={href} aria-current={active === k ? "page" : undefined}>{l}</Link>)}</nav>;
}

/** "+12% vs previous 90 days" — deltas come from sales_kpis() (lead_stage_history), never estimated client-side. */
export function KpiDelta({ value, unit = "%", days, invert = false }: { value: number | null | undefined; unit?: "%" | "pts"; days: number; invert?: boolean }) {
  if (value == null) return <small className="k-xs k-muted">No prior-period baseline</small>;
  const good = invert ? value < 0 : value > 0; const flat = value === 0;
  return <small className={`k-xs ${flat ? "k-muted" : good ? "k-green" : "k-red"}`}>{value > 0 ? "+" : ""}{value}{unit === "%" ? "%" : " pts"} vs previous {days} days</small>;
}
