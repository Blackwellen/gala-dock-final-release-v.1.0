import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ARTICLES, article } from "@/lib/help/articles";
import "@/styles/help.css";

type Shot = { version: number; captured_at: string; width: number; height: number; annotations: { n: number; caption: string; found: boolean; x?: number; y?: number; w?: number; h?: number }[] };
const manifest = (): Record<string, Shot> => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/help/manifest.json"), "utf8")); } catch { return {}; } };

export function generateStaticParams() { return ARTICLES.map(a => ({ slug: a.slug })); }
export async function generateMetadata({ params }: PageProps<"/help/[slug]">) { const a = article((await params).slug); return { title: a ? `${a.title} · Help` : "Help" }; }

/** Help article (release spec §84–85): purpose, prerequisites, steps, a real annotated screenshot, troubleshooting, related guides. */
export default async function HelpArticle({ params }: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  const a = article(slug); if (!a) notFound();
  if (a.slug !== slug) redirect(`/help/${a.slug}`);
  const shot = a.shot ? manifest()[a.slug] : undefined;
  return <main className="hc hc-article">
    <nav className="hc-crumbs" aria-label="Breadcrumb"><Link href="/help">Help Centre</Link> <span aria-hidden="true">›</span> <span>{a.audience}</span></nav>
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
    {a.related.length > 0 && <section><h2>Related guides</h2><ul className="hc-related">{a.related.map(r => { const x = article(r); return x ? <li key={r}><Link href={`/help/${x.slug}`}>{x.title}</Link></li> : null; })}</ul></section>}
    <footer className="hc-foot">Was this helpful? Tell us at <a href="mailto:support@galadock.com">support@galadock.com</a>.</footer>
  </main>;
}
