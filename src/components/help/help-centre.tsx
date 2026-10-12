import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { LifeBuoy, Mail, Search } from "lucide-react";
import { ARTICLES, article, type Article } from "@/lib/help/articles";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { ContactForm } from "./contact-form";
import "@/styles/help.css";

/**
 * Help Centre (release spec §84–85), rendered inside whichever shell the reader is in: public (/help), Provider
 * (/provider/help), Organizer (/organizer/help) or Customer (/account/help). `base` is the route prefix for article links.
 */
type Audience = Article["audience"];
const ORDER: Audience[] = ["Everyone", "Organizers", "Providers", "Customers", "Developers"];
const heading = (g: Audience) => g === "Everyone" ? "For everyone" : `For ${g.toLowerCase()}`;

type Shot = { version: number; captured_at: string; width: number; height: number; annotations: { n: number; caption: string; found: boolean; x?: number; y?: number; w?: number; h?: number }[] };
const manifest = (): Record<string, Shot> => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/help/manifest.json"), "utf8")); } catch { return {}; } };

export function HelpIndex({ base, q, first, contact }: { base: string; q: string; first?: Audience; contact: React.ReactNode }) {
  const query = q.trim().toLowerCase().slice(0, 80);
  const list = query ? ARTICLES.filter(a => `${a.title} ${a.summary} ${a.purpose} ${a.steps.join(" ")}`.toLowerCase().includes(query)) : ARTICLES;
  const groups = first ? [first, ...ORDER.filter(g => g !== first)] : ORDER;
  return <div className="hc">
    <header className="hc-head"><p className="hc-eyebrow">Gala Dock Help Centre</p><h1>How can we help?</h1>
      <form action={base} className="hc-search"><Search size={18} aria-hidden="true" /><input name="q" defaultValue={q} placeholder="Search guides — tickets, payouts, two-step verification…" aria-label="Search help" /><button>Search</button></form>
      <p className="hc-jump"><a href="#contact"><LifeBuoy size={15} aria-hidden="true" />Contact support</a></p></header>
    <div className="hc-layout">
      <div className="hc-guides">
        {groups.map(g => { const items = list.filter(a => a.audience === g); return items.length ? <section key={g} className="hc-group" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`}>{heading(g)}</h2>
          <ul>{items.map(a => <li key={a.slug}><Link href={`${base}/${a.slug}`}><b>{a.title}</b><span>{a.summary}</span></Link></li>)}</ul></section> : null; })}
        {!list.length && <p className="hc-empty">No guides match “{q}”. <Link href={base}>Show all guides</Link>, or ask our team below.</p>}
      </div>
      <aside className="hc-side" id="contact" aria-label="Contact support">{contact}</aside>
    </div>
  </div>;
}

export function HelpArticleView({ base, a, contact }: { base: string; a: Article; contact: React.ReactNode }) {
  const shot = a.shot ? manifest()[a.slug] : undefined;
  return <div className="hc hc-article">
    <nav className="hc-crumbs" aria-label="Breadcrumb"><Link href={base}>Help Centre</Link> <span aria-hidden="true">›</span> <span>{a.audience}</span></nav>
    <div className="hc-layout">
      <article className="hc-guides">
        <h1>{a.title}</h1>
        <p className="hc-lead">{a.purpose}</p>
        {a.prerequisites.length > 0 && <section className="hc-callout"><h2>Before you start</h2><ul>{a.prerequisites.map(p => <li key={p}>{p}</li>)}</ul></section>}
        {shot && <figure className="hc-shot">
          <div className="hc-shot-frame" style={{ aspectRatio: `${shot.width} / ${shot.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/help/${a.slug}.png?v=${shot.version}`} alt={`${a.title} — screenshot`} width={shot.width} height={shot.height} loading="lazy" />
            {shot.annotations.filter(x => x.found).map(x => <span key={x.n} className="hc-mark" style={{ left: `${(x.x! / shot.width) * 100}%`, top: `${(x.y! / shot.height) * 100}%`, width: `${(x.w! / shot.width) * 100}%`, height: `${(x.h! / shot.height) * 100}%` }}><b>{x.n}</b></span>)}
          </div>
          <figcaption><ol>{shot.annotations.map(x => <li key={x.n}>{x.caption}</li>)}</ol><small>Screenshot v{shot.version} · captured {new Date(shot.captured_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</small></figcaption>
        </figure>}
        <section><h2>How to</h2><ol className="hc-steps">{a.steps.map(s => <li key={s}>{s}</li>)}</ol></section>
        {a.troubleshooting.length > 0 && <section><h2>Troubleshooting</h2><dl className="hc-faq">{a.troubleshooting.map(t => <div key={t.q}><dt>{t.q}</dt><dd>{t.a}</dd></div>)}</dl></section>}
        {a.related.length > 0 && <section><h2>Related guides</h2><ul className="hc-related">{a.related.map(r => { const x = article(r); return x ? <li key={r}><Link href={`${base}/${x.slug}`}>{x.title}</Link></li> : null; })}</ul></section>}
      </article>
      <aside className="hc-side" id="contact" aria-label="Contact support">{contact}</aside>
    </div>
  </div>;
}

const STATUS: Record<string, string> = { open: "Open", waiting: "Waiting for you", escalated: "With a specialist", resolved: "Resolved" };

/** Contact panel: the form plus the reader's recent support requests (RLS: requester sees only their own cases). Signed-out → email. */
export async function SupportPanel({ workspaceId, source }: { workspaceId?: string | null; source: string }) {
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return <div className="hc-card"><h2>Contact support</h2><p>Can’t find what you need? <Link href="/login?next=/help%23contact">Sign in</Link> to send us a message and track it here, or email us.</p>
    <a className="hc-btn" href="mailto:support@galadock.com"><Mail size={16} aria-hidden="true" />support@galadock.com</a></div>;
  const { data: cases } = await sb.from("support_cases").select("reference,subject,status,created_at").eq("requester_id", user.id).order("created_at", { ascending: false }).limit(5);
  const list = (cases ?? []) as { reference: string; subject: string; status: string; created_at: string }[];
  return <>
    <div className="hc-card"><h2>Contact support</h2><p className="hc-sub">Can’t find the answer? Send our team a message.</p><ContactForm workspaceId={workspaceId} source={source} /></div>
    {list.length > 0 && <div className="hc-card"><h2>Your requests</h2><ul className="hc-cases">{list.map(c => <li key={c.reference}><span><b>{c.subject}</b><small>{c.reference} · {new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></span><em className={`st-${c.status}`}>{STATUS[c.status] ?? c.status}</em></li>)}</ul>
      <p className="hc-sub">We reply by email. Prefer email? <a href="mailto:support@galadock.com">support@galadock.com</a></p></div>}
  </>;
}
