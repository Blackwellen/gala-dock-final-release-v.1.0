import Link from "next/link";
import { redirect } from "next/navigation";
import { ARTICLES, article } from "@/lib/help/articles";
import "@/styles/help.css";

export const metadata = { title: "Help Centre · Gala Dock", description: "Guides for customers, organizers, providers and developers." };
const GROUPS = ["Everyone", "Organizers", "Providers", "Customers", "Developers"] as const;

/** Help Centre index (release spec §84). `?topic=<slug>` (used across the app) redirects to the article. */
export default async function HelpPage({ searchParams }: PageProps<"/help">) {
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" ? sp.topic : null;
  if (topic) { const a = article(topic); redirect(a ? `/help/${a.slug}` : "/help"); }
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 80) : "";
  const list = q ? ARTICLES.filter(a => `${a.title} ${a.summary} ${a.purpose} ${a.steps.join(" ")}`.toLowerCase().includes(q)) : ARTICLES;
  return <main className="hc">
    <header className="hc-head"><p className="hc-eyebrow">Gala Dock Help Centre</p><h1>How can we help?</h1>
      <form action="/help" className="hc-search"><input name="q" defaultValue={q} placeholder="Search guides — tickets, payouts, two-step verification…" aria-label="Search help" /><button>Search</button></form></header>
    {GROUPS.map(g => { const items = list.filter(a => a.audience === g); return items.length ? <section key={g} className="hc-group" aria-labelledby={`g-${g}`}>
      <h2 id={`g-${g}`}>{g === "Everyone" ? "For everyone" : `For ${g.toLowerCase()}`}</h2>
      <ul>{items.map(a => <li key={a.slug}><Link href={`/help/${a.slug}`}><b>{a.title}</b><span>{a.summary}</span></Link></li>)}</ul></section> : null; })}
    {!list.length && <p className="hc-empty">No guides match “{q}”. <Link href="/help">Show all guides</Link>.</p>}
    <footer className="hc-foot">Still stuck? Email <a href="mailto:support@galadock.com">support@galadock.com</a>.</footer>
  </main>;
}
