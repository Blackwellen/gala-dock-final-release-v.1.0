import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import "@/styles/provider-misc.css";
import { Thumb, Chip, Empty, PageHeader } from "@/components/workspace/kit";
import { day, titleCase } from "@/lib/workspace/format";
import { workspaceItems, workspaceJobs, workspaceListings, workspaceCrew, workspaceSpaces } from "@/lib/provider/queries";

export const metadata: Metadata = { title: "Search" };

/** Workspace search across opportunities, bookings, listings, spaces and team (all RLS-scoped). */
export default async function ProviderSearch(props: PageProps<"/provider/search">) {
  const sp = await props.searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const ql = q.toLowerCase();
  const has = (...v: (string | null | undefined)[]) => v.some(x => x?.toLowerCase().includes(ql));
  const [items, jobs, listings, crew, spaces] = q ? await Promise.all([workspaceItems(), workspaceJobs(), workspaceListings(), workspaceCrew(), workspaceSpaces()]) : [[], [], [], [], []];
  const groups = [
    { title: "Opportunities", rows: items.filter(i => has(i.event?.name, i.event?.client_name, i.event?.location, i.request?.reference)).map(i => ({ href: `/provider/opportunities/${i.id}`, img: i.event?.cover_image, title: i.event?.name ?? "", sub: `${i.event?.client_name} · ${day(i.event?.starts_at)}`, chip: titleCase(i.status) })) },
    { title: "Bookings", rows: jobs.filter(j => has(j.event_name, j.client_name, j.reference, j.location)).map(j => ({ href: `/provider/bookings/${j.id}`, img: j.image, title: j.event_name, sub: `${j.reference} · ${j.client_name} · ${day(j.starts_at)}`, chip: titleCase(j.status) })) },
    { title: "Listings", rows: listings.filter(l => has(l.name, l.category, l.city)).map(l => ({ href: l.kind === "venue" ? `/provider/venues/${l.id}` : `/provider/services/${l.id}`, img: l.image, title: l.name, sub: `${titleCase(l.kind)} · ${l.category}`, chip: l.published ? "Published" : l.paused_at ? "Paused" : "Draft" })) },
    { title: "Spaces", rows: spaces.filter(s => has(s.name)).map(s => ({ href: `/provider/venues/${s.venue_id}/spaces/${s.id}`, img: s.image, title: s.name, sub: `${Math.max(s.capacity_seated ?? 0, s.capacity_standing ?? 0)} capacity`, chip: titleCase(s.status) })) },
    { title: "Team", rows: crew.filter(c => has(c.name, c.role, ...c.skills)).map(c => ({ href: `/provider/team/${c.id}`, img: c.avatar, title: c.name, sub: c.role, chip: titleCase(c.status) })) },
  ].filter(g => g.rows.length);
  return <div className="ps">
    <PageHeader title="Search" subtitle={q ? `Results for “${q}”` : "Search opportunities, bookings, listings and team."} />
    <form className="ps-form" role="search" action="/provider/search"><Search aria-hidden="true" /><label className="sr-only" htmlFor="ps-q">Search</label>
      <input id="ps-q" name="q" defaultValue={q} placeholder="Search events, bookings, venues, services, or contacts..." /><button className="ws-btn primary">Search</button></form>
    {!q ? null : groups.length ? groups.map(g => <section key={g.title} className="ws-panel ps-group"><h2>{g.title} <span>{g.rows.length}</span></h2>
      <ul>{g.rows.slice(0, 12).map(r => <li key={r.href}><Link href={r.href}><Thumb src={r.img} w={40} h={40} /><span><b>{r.title}</b><small>{r.sub}</small></span><Chip tone="grey">{r.chip}</Chip></Link></li>)}</ul></section>)
      : <Empty icon={Search} title="No matches" text="Try a client name, event, booking reference or space." />}
  </div>;
}
